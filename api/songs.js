// Vercel function: the whole song map lives in one private blob, songs.json, shaped { [id]: song | tombstone }.
//   GET /api/songs  -> { songs, canEdit }   (READ_PASSWORD or EDIT_PASSWORD, always required)
//   PUT /api/songs  <- { songs: { [id]: song } } changed songs only; EDIT_PASSWORD. Merges by updatedAt, returns { songs }.
// The password travels as `Authorization: Bearer <encodeURIComponent(password)>`.
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { createHash, timingSafeEqual } from "node:crypto";
import { mergeNewest } from "../src/lib/storage.js";

const PATH = "songs.json";
const MAX_BODY = 4_000_000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Hash both sides so timingSafeEqual always compares equal lengths.
const digest = (s) => createHash("sha256").update(String(s)).digest();
const matches = (given, expected) => !!expected && timingSafeEqual(digest(given), digest(expected));

/** "edit", "read" or null. A password is always required. */
function roleOf(request) {
  const m = /^Bearer (.*)$/.exec(request.headers.get("authorization") || "");
  let pw = "";
  try { pw = m ? decodeURIComponent(m[1]) : ""; } catch { return null; }
  const { EDIT_PASSWORD, READ_PASSWORD } = process.env;
  if (pw && matches(pw, EDIT_PASSWORD)) return "edit";
  if (pw && matches(pw, READ_PASSWORD)) return "read";
  return null;
}

async function load() {
  const r = await get(PATH, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return { songs: {}, etag: null };
  const text = await new Response(r.stream).text();
  return { songs: text ? JSON.parse(text) : {}, etag: r.blob.etag };
}

const isSong = (s) => s && typeof s === "object" && !Array.isArray(s) && Array.isArray(s.sections);
const stamp = (s) => Number(s.updatedAt) || 0; // older songs and imported backups may lack updatedAt

/** Keeps valid songs and tombstones; skips anything else rather than failing the whole batch. */
function clean(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out = {};
  for (const [id, s] of Object.entries(input)) {
    if (!/^[\w-]{1,64}$/.test(id)) continue;
    if (s?.deleted === true) out[id] = { deleted: true, updatedAt: stamp(s) };
    else if (isSong(s)) out[id] = { ...s, updatedAt: stamp(s) };
  }
  return out;
}

export async function GET(request) {
  const role = roleOf(request);
  if (!role) return json({ error: "auth" }, 401);
  try {
    const { songs } = await load();
    return json({ songs, canEdit: role === "edit" });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
}

export async function PUT(request) {
  if (!process.env.EDIT_PASSWORD) return json({ error: "EDIT_PASSWORD is not set" }, 500);
  if (roleOf(request) !== "edit") return json({ error: "auth" }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
  let incoming;
  try { incoming = clean(JSON.parse(raw).songs); } catch { incoming = null; }
  if (!incoming) return json({ error: "bad request" }, 400);

  // Optimistic concurrency: write only if nobody changed the blob since we read it; otherwise re-read and merge again.
  let lastConflict = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { songs, etag } = await load();
      const merged = mergeNewest(songs, incoming);
      await put(PATH, JSON.stringify(merged), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
        cacheControlMaxAge: 60
      });
      return json({ songs: merged });
    } catch (e) {
      const conflict = e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e?.message));
      if (!conflict) { console.error(e); return json({ error: "server" }, 500); }
      lastConflict = `${e?.name}: ${e?.message}`;
    }
  }
  console.error("songs.json write conflict after retries:", lastConflict);
  return json({ error: "conflict", detail: lastConflict }, 409);
}
