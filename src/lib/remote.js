// Client for /api/songs. Every call resolves to { ok: true, ...data } or { ok: false, error },
// where error is "offline" (no network / no API), "auth" (wrong password) or "server".
const ENDPOINT = "/api/songs";

async function call(method, password, body) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, error: "offline" };
  const payload = body ? JSON.stringify(body) : undefined;
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method,
      cache: "no-store",
      // keepalive lets a push finish while the page is being hidden or closed; browsers cap it at 64 KB.
      keepalive: !!payload && payload.length < 60000,
      headers: {
        Authorization: "Bearer " + encodeURIComponent(password || ""),
        ...(payload ? { "Content-Type": "application/json" } : {})
      },
      body: payload
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (res.status === 401) return { ok: false, error: "auth" };
  // No API here (e.g. plain `vite` dev server answers with index.html or 404).
  if (res.status === 404 || !(res.headers.get("content-type") || "").includes("application/json")) return { ok: false, error: "offline" };
  if (!res.ok) return { ok: false, error: "server" };
  try {
    const data = await res.json();
    if (!data || typeof data.songs !== "object") return { ok: false, error: "server" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "server" };
  }
}

/** -> { ok, songs, canEdit } */
export const fetchRemote = (password) => call("GET", password);

/** Sends only the changed songs (and tombstones). -> { ok, songs } with the merged remote map. */
export const pushRemote = (password, changed) => call("PUT", password, { songs: changed });
