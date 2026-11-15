import { isLive } from "./song.js";

// Songs live in localStorage as { [id]: song }. Same key and shape as the original single-file app.
// A deleted song stays as a tombstone { deleted: true, updatedAt } so the delete reaches the remote copy.
export const LS_KEY = "guions.songs.v1";
export const AUTH_KEY = "guions.auth.v1";

/** The map without tombstones: what the UI lists and what the JSON backup exports. */
export function liveSongs(songs) {
  return Object.fromEntries(Object.entries(songs).filter(([, s]) => isLive(s)));
}

/** Remote connection: { password, canEdit } or null when the app is local only. */
export function loadAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return a && typeof a.password === "string" ? { password: a.password, canEdit: !!a.canEdit } : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  try {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* private mode: the connection lasts for this session only */ }
}

export function loadSongs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Returns true when the write succeeded. */
export function saveSongs(songs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(songs));
    return true;
  } catch {
    return false;
  }
}

const isSong = (s) => s && typeof s === "object" && Array.isArray(s.sections);

/**
 * Accepts a backup file in any of these shapes and returns { [id]: song }:
 *   { [id]: song }                       — this app's export / localStorage dump
 *   { songs: { [id]: song } | [...] }    — wrapped
 *   [ song | { id, ...song } | { id, data: song } ]
 */
export function parseBackup(text) {
  let data = JSON.parse(text);
  if (data && !Array.isArray(data) && data.songs) data = data.songs;
  const out = {};
  const add = (id, s) => { if (isSong(s)) { const { id: _drop, ...song } = s; out[id || crypto.randomUUID().replace(/-/g, "").slice(0, 16)] = song; } };
  if (Array.isArray(data)) for (const item of data) add(item?.id, item?.data && isSong(item.data) ? item.data : item);
  else if (data && typeof data === "object") for (const [id, s] of Object.entries(data)) add(id, s);
  return out;
}

/** Merge b into a, keeping whichever copy of each song was updated last. */
export function mergeNewest(a, b) {
  const out = { ...a };
  for (const [id, s] of Object.entries(b)) if (!out[id] || (s.updatedAt || 0) >= (out[id].updatedAt || 0)) out[id] = s;
  return out;
}

export function download(filename, data, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
