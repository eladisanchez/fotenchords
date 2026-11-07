import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { Backup } from "./components/Editor.jsx";
import Sheet from "./components/Sheet.jsx";
import StatusIcon from "./components/StatusIcon.jsx";
import { standaloneHTML } from "./lib/exportHtml.jsx";
import { MAX_SIZE, MIN_SIZE, blankSong, chordPro, exampleSong, folderOf, listFolders, slug, transpose, uid } from "./lib/song.js";
import { LS_KEY, download, loadSongs, mergeNewest, parseBackup, saveSongs } from "./lib/storage.js";

const SAVED = { kind: "saved", text: "Desat en aquest dispositiu" };

// Folder filter: ALL, "" (songs without a folder) or a folder name. Per-device preference.
const ALL = "*";
const FOLDER_KEY = "guions.folder";
const loadFolder = () => { try { return localStorage.getItem(FOLDER_KEY) ?? ALL; } catch { return ALL; } };
const inFolder = (s, f) => f === ALL || folderOf(s) === f;

function pickLatest(songs, f = ALL) {
  let best = null;
  for (const [id, s] of Object.entries(songs)) {
    if (!inFolder(s, f)) continue;
    if (!best || (s.updatedAt || 0) > (songs[best].updatedAt || 0)) best = id;
  }
  return best;
}

export default function App() {
  const [songs, setSongs] = useState(loadSongs);
  const [folder, setFolder] = useState(loadFolder);
  const [cur, setCur] = useState(() => pickLatest(songs, folder) || pickLatest(songs));
  const [status, setStatus] = useState(SAVED);
  const [tab, setTab] = useState("edit");
  const [focusId, setFocusId] = useState(null);

  // ---------- persistence: debounced write of the whole map ----------
  const songsRef = useRef(songs);
  const curRef = useRef(cur);
  const dirty = useRef(false);
  const immediate = useRef(false);
  const fromStorage = useRef(false);
  const timer = useRef(null);
  const savedMsg = useRef(null); // one-off status to show after the next successful save
  curRef.current = cur;

  // Transient message (import/export results, errors) shown as a floating toast so the toolbar never reflows.
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const notify = useCallback((text, kind = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const ok = saveSongs(songsRef.current);
    setStatus(ok ? SAVED : { kind: "error", text: "No s'ha pogut desar" });
    if (ok && savedMsg.current) notify(savedMsg.current);
    if (!ok) notify("No s'ha pogut desar", "error");
    savedMsg.current = null;
  }, [notify]);

  useEffect(() => {
    songsRef.current = songs;
    if (fromStorage.current) { fromStorage.current = false; return; }
    if (!dirty.current) return;
    if (immediate.current) { immediate.current = false; flush(); return; }
    setStatus({ kind: "saving", text: "Desant…" });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [songs, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    // Another tab/window of the app wrote: take its data, but keep the song we are mid-edit on.
    const onStorage = (e) => {
      if (e.key !== LS_KEY) return;
      let incoming = {};
      try { incoming = e.newValue ? JSON.parse(e.newValue) : {}; } catch { return; }
      setSongs((prev) => {
        const id = curRef.current;
        if (dirty.current && id && prev[id]) return { ...incoming, [id]: prev[id] };
        fromStorage.current = true;
        return incoming;
      });
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("storage", onStorage);
    };
  }, [flush]);

  // Current song vanished (deleted here or in another tab): open the most recent one.
  useEffect(() => { if (!cur || !songs[cur]) { const next = pickLatest(songs); if (next !== cur) setCur(next); } }, [songs, cur]);

  useEffect(() => { document.body.dataset.tab = tab; }, [tab]);

  // ---------- folders ----------
  const song = cur ? songs[cur] : null;
  const folders = listFolders(songs);
  const hasUnfiled = Object.values(songs).some((s) => !folderOf(s));

  // Keep the filter valid and always showing the open song (e.g. after its folder changes or an import).
  useEffect(() => {
    let next = folder;
    if (next !== ALL && (next === "" ? !hasUnfiled || !folders.length : !folders.includes(next))) next = ALL;
    if (song && !inFolder(song, next)) next = folderOf(song) || ALL;
    if (next !== folder) setFolder(next);
  }, [folder, song, folders, hasUnfiled]);

  useEffect(() => { try { localStorage.setItem(FOLDER_KEY, folder); } catch { /* ignore */ } }, [folder]);

  const selectFolder = (f) => {
    flush();
    setFolder(f);
    if (!song || !inFolder(song, f)) setCur(pickLatest(songs, f));
  };

  // ---------- mutations ----------

  /** Apply `fn` to a copy of the current song. `focus` = element id to focus after render. */
  const update = useCallback((fn, focus) => {
    const id = curRef.current;
    dirty.current = true;
    setSongs((prev) => {
      if (!prev[id]) return prev;
      const s = structuredClone(prev[id]);
      fn(s);
      s.updatedAt = Date.now();
      return { ...prev, [id]: s };
    });
    if (focus) setFocusId(focus);
  }, []);

  const addSong = (s) => {
    const id = uid();
    if (folder !== ALL && folder) s.folder = folder;
    s.updatedAt = Date.now();
    dirty.current = true; immediate.current = true;
    setSongs((prev) => ({ ...prev, [id]: s }));
    setCur(id); setTab("edit"); setFocusId("m-title");
  };

  const deleteSong = () => {
    const id = cur;
    dirty.current = true; immediate.current = true;
    setSongs((prev) => { const { [id]: _gone, ...rest } = prev; return rest; });
    setCur(null);
  };

  const selectSong = (id) => { flush(); setCur(id || null); };

  const exportAll = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    download(`fotenchords-${stamp}.json`, JSON.stringify(songs, null, 2), "application/json");
    notify("Còpia baixada");
  };

  const importFile = async (file) => {
    let imported;
    try { imported = parseBackup(await file.text()); } catch { notify("Fitxer no vàlid", "error"); return; }
    const n = Object.keys(imported).length;
    if (!n) { notify("No hi ha cançons al fitxer", "error"); return; }
    dirty.current = true; immediate.current = true;
    savedMsg.current = n === 1 ? "1 cançó importada" : `${n} cançons importades`;
    setSongs((prev) => mergeNewest(prev, imported));
    if (!cur) setCur(pickLatest(imported));
  };

  const exportHtml = () => {
    if (!song) return;
    download(slug(song.title) + ".html", standaloneHTML(song), "text/html;charset=utf-8");
  };

  const printSheet = () => { flush(); window.print(); };

  const list = Object.entries(songs).filter(([, s]) => inFolder(s, folder)).sort((a, b) => String(a[1].title || "").localeCompare(String(b[1].title || ""), "ca"));
  const has = !!song;
  const onFocused = useCallback(() => setFocusId(null), []);

  return (
    <>
      <header className="topbar">
        <div className="bar-in">
          <h1 className="brand">FotenChords<span>.</span></h1>
          <div className="picker">
            {folders.length ? (
              <select className="folder" aria-label="Carpeta" value={folder} onChange={(e) => selectFolder(e.target.value)}>
                <option value={ALL}>Totes les carpetes</option>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                {hasUnfiled ? <option value="">Sense carpeta</option> : null}
              </select>
            ) : null}
            <select aria-label="Cançó oberta" value={cur || ""} disabled={!list.length} onChange={(e) => selectSong(e.target.value)}>
              {list.length
                ? list.map(([id, s]) => <option key={id} value={id}>{(s.title || "Sense títol") + (s.artist ? " — " + s.artist : "")}</option>)
                : <option value="">Cap cançó</option>}
            </select>
            <button className="btn primary" type="button" onClick={() => addSong(blankSong())}>+ Nova</button>
          </div>
          <div className="tools">
            <div className="group" title="Transposa tots els acords">
              <span className="lbl">To</span>
              <button className="btn icon" type="button" aria-label="Baixa mig to" disabled={!has} onClick={() => update((s) => transpose(s, -1))}>−½</button>
              <button className="btn icon" type="button" aria-label="Puja mig to" disabled={!has} onClick={() => update((s) => transpose(s, 1))}>+½</button>
            </div>
            <div className="group" title="Mida de la lletra al full">
              <span className="lbl">Mida</span>
              <button className="btn icon" type="button" aria-label="Lletra més petita" disabled={!has} onClick={() => update((s) => { s.size = Math.max(MIN_SIZE, (s.size || 16) - 1); })}>A−</button>
              <button className="btn icon" type="button" aria-label="Lletra més gran" disabled={!has} onClick={() => update((s) => { s.size = Math.min(MAX_SIZE, (s.size || 16) + 1); })}>A+</button>
            </div>
            <label className="toggle">
              <input type="checkbox" disabled={!has} checked={!!song?.two} onChange={(e) => { const v = e.target.checked; update((s) => { s.two = v; }); }} /> 2 columnes
            </label>
            <button className="btn" type="button" disabled={!has} onClick={printSheet} title="Imprimeix el full o desa'l com a PDF">Imprimir / PDF</button>
            <button className="btn" type="button" disabled={!has} onClick={exportHtml} title="Baixa un fitxer HTML que s'obre i imprimeix el full">HTML</button>
            <button className="btn" type="button" disabled={!has} onClick={() => download(slug(song.title) + ".txt", chordPro(song))} title="Baixa la cançó en format ChordPro">ChordPro</button>
            <StatusIcon status={status} />
          </div>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>Editar</button>
            <button type="button" role="tab" aria-selected={tab === "sheet"} onClick={() => setTab("sheet")}>Full</button>
          </div>
        </div>
      </header>

      <main>
        <section className="col edit-col" aria-label="Editor">
          <Editor
            key={cur || "none"}
            song={song}
            update={update}
            folders={folders}
            onNew={() => addSong(blankSong())}
            onExample={() => addSong(exampleSong())}
            onDelete={deleteSong}
            focusId={focusId}
            onFocused={onFocused}
            backup={<Backup onExportAll={exportAll} onImport={importFile} canExport={list.length > 0} />}
          />
        </section>
        <section className="preview-col" aria-label="Previsualització del full">
          <Sheet song={song} />
        </section>
      </main>

      <div className="toast-wrap" role="status" aria-live="polite">
        {toast ? <div key={toast.key} className={"toast " + toast.kind}>{toast.text}</div> : null}
      </div>
    </>
  );
}
