export const TYPES = [
  ["intro", "Intro"], ["verse", "Estrofa"], ["pre", "Pre-tornada"], ["chorus", "Tornada"],
  ["bridge", "Pont"], ["solo", "Solo"], ["inst", "Instrumental"], ["outro", "Outro"], ["note", "Nota"], ["rep", "Repetició"]
];
export const TYPE_NAME = Object.fromEntries(TYPES);

export const MIN_SIZE = 12;
export const MAX_SIZE = 22;

/** A song's folder name; "" when it has none. Folders are derived from songs, never stored on their own. */
export const folderOf = (s) => String(s?.folder || "").trim();

/** Unique non-empty folder names across a { [id]: song } map, sorted. */
export const listFolders = (songs) =>
  [...new Set(Object.values(songs).map(folderOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ca"));

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "").slice(0, 16);

export const blankSong = () => ({
  title: "", artist: "", key: "", bpm: "", capo: "", time: "4/4", size: 16, two: false,
  sections: [
    { id: uid(), type: "intro", label: "", times: 1, text: "" },
    { id: uid(), type: "verse", label: "", times: 1, text: "" },
    { id: uid(), type: "chorus", label: "", times: 1, text: "" }
  ]
});

export const exampleSong = () => ({
  title: "Últim tren", artist: "Cançó d'exemple", key: "D", bpm: "168", capo: "", time: "4/4", size: 16, two: false,
  sections: [
    { id: uid(), type: "intro", label: "", times: 2, text: "| [D] | [A] | [Bm] | [G] |" },
    { id: "v1", type: "verse", label: "", times: 1, text: "[D]Les llums del carrer s'a[A]paguen d'una en una\n[Bm]tinc la motxilla plena i la [G]butxaca buida\n[D]el rellotge de l'estació em [A]diu que faig tard\n[Bm]però encara corro, encara [G]corro" },
    { id: "p1", type: "pre", label: "", times: 1, text: "[Em]I no sé on em [G]porta,\nperò [A]pujo igual" },
    { id: "c1", type: "chorus", label: "", times: 1, text: "[D]Últim tren, [A]últim crit\n[Bm]no em deixis aquí a[G]questa nit\n[D]Últim tren, [A]fins al final\n[Bm]tot el que tinc [G]cap dins un va[A]gó" },
    { id: uid(), type: "verse", label: "", times: 1, text: "[D]Els amics ja dormen, els [A]bars tanquen la porta\n[Bm]la ciutat em mira com qui [G]mira una cosa morta\n[D]però tinc tres acords i [A]una veu esquerdada\n[Bm]i amb això ja en tinc prou per [G]no perdre la tornada" },
    { id: uid(), type: "rep", label: "", times: 1, ref: "p1", text: "" },
    { id: uid(), type: "rep", label: "", times: 2, ref: "c1", text: "" },
    { id: uid(), type: "solo", label: "", times: 2, text: "| [Bm] | [G] | [D] | [A] |\ne|--------------------------|\nB|--10-12-10----------10----|\nG|------------11-9-11-------|\n(segona volta, una octava amunt)" },
    { id: uid(), type: "bridge", label: "", times: 1, text: "[G]I quan arribi on sigui, [A]no miraré enrere\n[Bm]que el que deixo a l'andana [A]ja no m'espera" },
    { id: uid(), type: "rep", label: "", times: 2, ref: "c1", text: "" },
    { id: uid(), type: "outro", label: "", times: 1, text: "| [D] | [A] | [Bm] | [G] | [D] |\n(cop final tots junts)" }
  ]
});

/** Section labels ("Estrofa 2") are derived, never stored. */
export function autoLabels(song) {
  const counts = {}, idx = {}, labels = {};
  for (const s of song.sections) if (s.type !== "rep") counts[s.type] = (counts[s.type] || 0) + 1;
  for (const s of song.sections) {
    if (s.type === "rep") continue;
    idx[s.type] = (idx[s.type] || 0) + 1;
    labels[s.id] = s.label?.trim() || (TYPE_NAME[s.type] + (counts[s.type] > 1 && ["verse", "chorus", "pre", "solo", "bridge"].includes(s.type) ? " " + idx[s.type] : ""));
  }
  return labels;
}

/** Sections a `rep` at position i may point at: earlier, written ones. */
export const repTargets = (sections, i) => sections.slice(0, i).filter((x) => x.type !== "rep" && x.type !== "note");

/** Default target for a new `rep`: the last chorus, else the last written section. */
export function defaultRepRef(before) {
  const rev = [...before].reverse();
  const prev = rev.find((x) => x.type === "chorus") || rev.find((x) => x.type !== "rep" && x.type !== "note");
  return prev ? prev.id : "";
}

export function structureLine(song) {
  const abbr = { intro: "Intro", verse: "E", pre: "Pre", chorus: "T", bridge: "Pont", solo: "Solo", inst: "Inst", outro: "Outro" };
  return song.sections.filter((s) => s.type !== "note").map((s) => {
    const t = s.type === "rep" ? (song.sections.find((x) => x.id === s.ref) || {}).type : s.type;
    const a = abbr[t] || ""; return a + (Number(s.times) > 1 ? "×" + s.times : "");
  }).filter(Boolean).join(" · ");
}

// ---------- text parsing ----------
export const isTab = (l) => /^\s*[a-gA-G]?\|[-0-9hpbr/\\~x|]/.test(l) && /-{2,}/.test(l);

export function parseLine(line) {
  const segs = []; const re = /\[([^\]]*)\]/g; let last = 0, m;
  while ((m = re.exec(line))) {
    const txt = line.slice(last, m.index);
    if (segs.length) segs[segs.length - 1].t += txt; else if (txt) segs.push({ c: "", t: txt });
    segs.push({ c: m[1].trim(), t: "" }); last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (segs.length) segs[segs.length - 1].t += tail; else segs.push({ c: "", t: tail });
  return segs;
}

/**
 * Classifies each line of a section's text:
 *   gap | tab | note | chordrow (chords + bar marks only) | line (chords over lyrics)
 */
export function parseText(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { out.push({ kind: "gap" }); continue; }
    if (isTab(line)) { out.push({ kind: "tab", text: line }); continue; }
    if (/^\s*\(.*\)\s*$/.test(line)) { out.push({ kind: "note", text: line.trim() }); continue; }
    const segs = parseLine(line);
    const hasChords = segs.some((s) => s.c);
    const lyricText = segs.map((s) => s.t).join("").replace(/[|\s:x×0-9%./-]/gi, "");
    if (hasChords && !lyricText) {
      const parts = [];
      const re = /\[([^\]]*)\]|(\|+:?|:?\|+)|([^[\]|\s]+)/g; let m;
      while ((m = re.exec(line))) {
        if (m[1] !== undefined) parts.push({ kind: "chord", text: m[1].trim() });
        else if (m[2]) parts.push({ kind: "bar", text: m[2] });
        else if (m[3]) parts.push({ kind: "bt", text: m[3] });
      }
      out.push({ kind: "chordrow", parts }); continue;
    }
    out.push({ kind: "line", hasChords, segs });
  }
  return out;
}

// ---------- transpose ----------
const SH = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FL = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const noteIdx = (n) => { const i = SH.indexOf(n); return i >= 0 ? i : FL.indexOf(n); };
const FLAT_KEYS = new Set(["F", "A#", "D#", "G#", "C#", "Dm", "Gm", "Cm", "Fm", "A#m", "D#m"]);
function tNote(n, d, flat) { const i = noteIdx(n); return i < 0 ? n : (flat ? FL : SH)[(i + d + 120) % 12]; }
function tChord(c, d, flat) {
  const m = c.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/); if (!m) return c;
  return tNote(m[1], d, flat) + m[2] + (m[3] ? "/" + tNote(m[3], d, flat) : "");
}
/** Mutates `song`: shifts the key field and every [chord] by d semitones. */
export function transpose(song, d) {
  let flat;
  const km = String(song.key || "").trim().match(/^([A-G][#b]?)(m?)/);
  if (km) {
    const nk = SH[(noteIdx(km[1]) + d + 120) % 12] + km[2]; flat = FLAT_KEYS.has(nk);
    song.key = tNote(km[1], d, flat) + String(song.key).trim().slice(km[1].length);
  } else flat = song.sections.some((s) => /\[[A-G]b/.test(s.text || ""));
  for (const s of song.sections) s.text = String(s.text || "").replace(/\[([^\]]*)\]/g, (_, c) => "[" + tChord(c.trim(), d, flat) + "]");
}

// ---------- export ----------
export const slug = (s) =>
  String(s || "canco").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canco";

export function chordPro(song) {
  const labels = autoLabels(song); const L = [];
  L.push(`{title: ${song.title || ""}}`); if (song.artist) L.push(`{artist: ${song.artist}}`);
  if (song.key) L.push(`{key: ${song.key}}`); if (song.bpm) L.push(`{tempo: ${song.bpm}}`);
  if (song.time) L.push(`{time: ${song.time}}`); if (song.capo) L.push(`{capo: ${song.capo}}`);
  for (const s of song.sections) {
    L.push("");
    const x = Number(s.times) > 1 ? ` x${s.times}` : "";
    if (s.type === "rep") { const r = song.sections.find((y) => y.id === s.ref); L.push(`{comment: ${r ? labels[r.id] : "—"}${x}}`); continue; }
    if (s.type === "chorus") L.push(`{start_of_chorus: ${labels[s.id]}${x}}`, s.text || "", "{end_of_chorus}");
    else if (s.type === "verse") L.push(`{start_of_verse: ${labels[s.id]}${x}}`, s.text || "", "{end_of_verse}");
    else L.push(`{comment: ${labels[s.id]}${x}}`, s.text || "");
  }
  return L.join("\n") + "\n";
}
