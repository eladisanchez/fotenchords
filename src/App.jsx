import { useCallback, useEffect, useRef, useState } from "react";
import Connection from "./components/Connection.jsx";
import Editor, { Backup } from "./components/Editor.jsx";
import Sheet from "./components/Sheet.jsx";
import StatusIcon from "./components/StatusIcon.jsx";
import { standaloneHTML } from "./lib/exportHtml.jsx";
import { fetchRemote, pushRemote } from "./lib/remote.js";
import { MAX_SIZE, MIN_SIZE, blankSong, chordPro, exampleSong, folderOf, isLive, listFolders, slug, transpose, uid } from "./lib/song.js";
import { AUTH_KEY, LS_KEY, download, liveSongs, loadAuth, loadSongs, mergeNewest, parseBackup, saveAuth, saveSongs } from "./lib/storage.js";

const SAVED = { kind: "saved", text: "Desat en aquest dispositiu" };
const PUSH_DELAY = 4000; // longer than the local save debounce: fewer writes to the remote store

// Remote sync state -> what the status icon shows when a connection is configured.
const SYNC = {
  synced: { kind: "synced", text: "Sincronitzat" },
  pending: { kind: "pending", text: "Canvis pendents de pujar" },
  syncing: { kind: "saving", text: "Sincronitzant…" },
  offline: { kind: "offline", text: "Sense connexió: es desa en aquest dispositiu" },
  error: { kind: "error", text: "Error de sincronització" },
  auth: { kind: "error", text: "Contrasenya incorrecta" }
};
const ERROR_TEXT = { offline: "No s'ha pogut connectar amb el servidor", auth: "Contrasenya incorrecta", server: "Error del servidor" };

// Folder filter: ALL, "" (songs without a folder) or a folder name. Per-device preference.
const ALL = "*";
const FOLDER_KEY = "guions.folder";
const loadFolder = () => { try { return localStorage.getItem(FOLDER_KEY) ?? ALL; } catch { return ALL; } };
const inFolder = (s, f) => f === ALL || folderOf(s) === f;

function pickLatest(songs, f = ALL) {
  let best = null;
  for (const [id, s] of Object.entries(songs)) {
    if (!isLive(s) || !inFolder(s, f)) continue;
    if (!best || (s.updatedAt || 0) > (songs[best].updatedAt || 0)) best = id;
  }
  return best;
}

export default function App() {
  const [songs, setSongs] = useState(loadSongs);
  const [folder, setFolder] = useState(loadFolder);
  const [cur, setCur] = useState(() => pickLatest(songs, folder) || pickLatest(songs));
  const [status, setStatus] = useState(SAVED);
  const [focusId, setFocusId] = useState(null);
  const [auth, setAuth] = useState(loadAuth); // { password, canEdit } | null (local only)
  const [sync, setSync] = useState(auth && !auth.guest ? "syncing" : null);
  const readOnly = !!auth && !auth.canEdit;
  const [tab, setTab] = useState(readOnly ? "sheet" : "edit");

  // ---------- persistence: debounced write of the whole map ----------
  const songsRef = useRef(songs);
  const curRef = useRef(cur);
  const dirty = useRef(false);
  const immediate = useRef(false);
  const fromStorage = useRef(false);
  const timer = useRef(null);
  const savedMsg = useRef(null); // one-off status to show after the next successful save
  curRef.current = cur;

  // ---------- remote sync ----------
  const authRef = useRef(auth);
  authRef.current = auth;
  const pending = useRef(new Set()); // ids changed here and not yet pushed
  const pushTimer = useRef(null);
  const pushing = useRef(false);

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
    if (ok) schedulePushRef.current();
  }, [notify]);

  const fail = useCallback((error) => {
    if (error === "auth") {
      // The saved password no longer works (changed on the server): back to the login screen.
      clearTimeout(pushTimer.current);
      saveAuth(null); setAuth(null); authRef.current = null; setSync(null);
      notify("La contrasenya ja no és vàlida. Torna a entrar.", "error");
      return;
    }
    setSync(error === "offline" ? "offline" : "error");
  }, [notify]);

  /** Merge a remote map into the local one (newest copy of each song wins) and save it here. */
  const ingest = useCallback((remote, canEdit) => {
    if (canEdit) {
      // Anything newer here than there (or missing there) still has to go up: covers the first push and lost pushes.
      for (const [id, s] of Object.entries(songsRef.current)) {
        if (!remote[id] || (s.updatedAt || 0) > (remote[id].updatedAt || 0)) pending.current.add(id);
      }
    }
    dirty.current = true; immediate.current = true;
    setSongs((prev) => mergeNewest(prev, remote));
  }, []);

  const push = useCallback(async () => {
    clearTimeout(pushTimer.current);
    const a = authRef.current;
    if (!a?.canEdit || a.guest || !pending.current.size) return;
    if (pushing.current) { pushTimer.current = setTimeout(() => pushRef.current(), 1000); return; }
    const ids = [...pending.current];
    pending.current.clear();
    const changed = {};
    for (const id of ids) if (songsRef.current[id]) changed[id] = songsRef.current[id];
    pushing.current = true;
    setSync("syncing");
    const r = await pushRemote(a.password, changed);
    pushing.current = false;
    if (authRef.current !== a) return; // disconnected meanwhile
    if (!r.ok) {
      for (const id of ids) pending.current.add(id);
      fail(r.error);
      return;
    }
    ingest(r.songs, false);
    if (pending.current.size) { setSync("pending"); schedulePushRef.current(); } else setSync("synced");
  }, [fail, ingest]);

  const schedulePush = useCallback(() => {
    if (!authRef.current?.canEdit || authRef.current.guest || !pending.current.size) return;
    setSync("pending");
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushRef.current(), PUSH_DELAY);
  }, []);

  // flush() is defined before push/schedulePush; reach them through refs.
  const pushRef = useRef(push);
  pushRef.current = push;
  const schedulePushRef = useRef(schedulePush);
  schedulePushRef.current = schedulePush;

  const pull = useCallback(async () => {
    const a = authRef.current;
    if (!a || a.guest) return;
    setSync("syncing");
    const r = await fetchRemote(a.password);
    if (authRef.current !== a) return;
    if (!r.ok) { fail(r.error); return; }
    let next = a;
    if (!!r.canEdit !== a.canEdit) { next = { ...a, canEdit: !!r.canEdit }; saveAuth(next); setAuth(next); authRef.current = next; }
    ingest(r.songs, next.canEdit);
    if (next.canEdit && pending.current.size) push(); else setSync("synced");
  }, [fail, ingest, push]);

  /** Connection card: returns an error text, or null on success. */
  const connect = async (password) => {
    const r = await fetchRemote(password);
    if (!r.ok) return ERROR_TEXT[r.error] || ERROR_TEXT.server;
    const a = { password, canEdit: !!r.canEdit };
    saveAuth(a); setAuth(a); authRef.current = a;
    ingest(r.songs, a.canEdit);
    if (a.canEdit && pending.current.size) push(); else setSync("synced");
    if (!a.canEdit) setTab("sheet");
    notify(a.canEdit ? "Connectat com a editor" : "Connectat com a lector");
    return null;
  };

  /** Guest: no password, no server. Songs stay on this device only. */
  const enterGuest = () => {
    const a = { guest: true, password: "", canEdit: true };
    saveAuth(a); setAuth(a); authRef.current = a; setSync(null);
    setTab("edit");
    notify("Has entrat com a convidat");
  };

  const disconnect = () => {
    clearTimeout(pushTimer.current);
    pending.current.clear();
    saveAuth(null); setAuth(null); authRef.current = null; setSync(null);
    notify(auth?.guest ? "Has sortit del mode convidat" : "Sessió tancada");
  };

  useEffect(() => {
    pull();
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    const onOnline = () => pull();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [pull]);

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
    const onHide = () => { if (document.visibilityState === "hidden") { flush(); pushRef.current(); } };
    // Another tab/window of the app wrote: take its data, but keep the song we are mid-edit on.
    const onStorage = (e) => {
      if (e.key === AUTH_KEY) { const a = loadAuth(); setAuth(a); authRef.current = a; setSync(a && !a.guest ? "synced" : null); return; }
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
  useEffect(() => { if (!cur || !isLive(songs[cur])) { const next = pickLatest(songs); if (next !== cur) setCur(next); } }, [songs, cur]);

  useEffect(() => { document.body.dataset.tab = tab; }, [tab]);
  useEffect(() => { if (readOnly) setTab("sheet"); }, [readOnly]);

  // ---------- folders ----------
  const song = cur && isLive(songs[cur]) ? songs[cur] : null;
  const folders = listFolders(songs);
  const hasUnfiled = Object.values(songs).some((s) => isLive(s) && !folderOf(s));

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
    if (!id || (authRef.current && !authRef.current.canEdit)) return;
    dirty.current = true;
    pending.current.add(id);
    setSongs((prev) => {
      if (!isLive(prev[id])) return prev;
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
    pending.current.add(id);
    setSongs((prev) => ({ ...prev, [id]: s }));
    setCur(id); setTab("edit"); setFocusId("m-title");
  };

  const deleteSong = () => {
    const id = cur;
    dirty.current = true; immediate.current = true;
    pending.current.add(id);
    // Tombstone instead of removing the key, so the delete syncs and an older copy elsewhere can't bring it back.
    const tomb = { deleted: true, updatedAt: Date.now() };
    setSongs((prev) => ({ ...prev, [id]: tomb }));
    setCur(null);
  };

  const selectSong = (id) => { flush(); setCur(id || null); };

  const exportAll = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    download(`fotenchords-${stamp}.json`, JSON.stringify(liveSongs(songs), null, 2), "application/json");
    notify("Còpia baixada");
  };

  const importFile = async (file) => {
    let imported;
    try { imported = parseBackup(await file.text()); } catch { notify("Fitxer no vàlid", "error"); return; }
    const n = Object.keys(imported).length;
    if (!n) { notify("No hi ha cançons al fitxer", "error"); return; }
    dirty.current = true; immediate.current = true;
    savedMsg.current = n === 1 ? "1 cançó importada" : `${n} cançons importades`;
    for (const id of Object.keys(imported)) pending.current.add(id); // the server keeps the newest copy anyway
    // A song deleted here and restored from a backup must beat its tombstone, here and on the server.
    const now = Date.now();
    for (const [id, s] of Object.entries(imported)) if (songsRef.current[id]?.deleted) s.updatedAt = now;
    setSongs((prev) => mergeNewest(prev, imported));
    if (!cur) setCur(pickLatest(imported));
  };

  const exportHtml = () => {
    if (!song) return;
    download(slug(song.title) + ".html", standaloneHTML(song), "text/html;charset=utf-8");
  };

  const printSheet = () => { flush(); window.print(); };

  const list = Object.entries(songs).filter(([, s]) => isLive(s) && inFolder(s, folder)).sort((a, b) => String(a[1].title || "").localeCompare(String(b[1].title || ""), "ca"));
  const has = !!song;
  const canEdit = has && !readOnly;
  const shownStatus = status.kind !== "saved" || !auth || !sync ? status : SYNC[sync];
  const connection = <Connection auth={auth} sync={sync} onConnect={connect} onDisconnect={disconnect} onSync={pull} />;
  const onFocused = useCallback(() => setFocusId(null), []);

  // Login is mandatory: without a saved connection nothing else is rendered.
  if (!auth) {
    return (
      <>
        <main className="login">
          <h1 className="brand">FotenChords<span>.</span></h1>
          <Connection auth={null} sync={null} onConnect={connect} onGuest={enterGuest} />
        </main>
        <div className="toast-wrap" role="status" aria-live="polite">
          {toast ? <div key={toast.key} className={"toast " + toast.kind}>{toast.text}</div> : null}
        </div>
      </>
    );
  }

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
            {readOnly ? null : <button className="btn primary" type="button" onClick={() => addSong(blankSong())}>+ Nova</button>}
          </div>
          <div className="tools">
            <div className="group" title="Transposa tots els acords">
              <span className="lbl">To</span>
              <button className="btn icon" type="button" aria-label="Baixa mig to" disabled={!canEdit} onClick={() => update((s) => transpose(s, -1))}>−½</button>
              <button className="btn icon" type="button" aria-label="Puja mig to" disabled={!canEdit} onClick={() => update((s) => transpose(s, 1))}>+½</button>
            </div>
            <div className="group" title="Mida de la lletra al full">
              <span className="lbl">Mida</span>
              <button className="btn icon" type="button" aria-label="Lletra més petita" disabled={!canEdit} onClick={() => update((s) => { s.size = Math.max(MIN_SIZE, (s.size || 16) - 1); })}>A−</button>
              <button className="btn icon" type="button" aria-label="Lletra més gran" disabled={!canEdit} onClick={() => update((s) => { s.size = Math.min(MAX_SIZE, (s.size || 16) + 1); })}>A+</button>
            </div>
            <label className="toggle">
              <input type="checkbox" disabled={!canEdit} checked={!!song?.two} onChange={(e) => { const v = e.target.checked; update((s) => { s.two = v; }); }} /> 2 columnes
            </label>
            <button className="btn" type="button" disabled={!has} onClick={printSheet} title="Imprimeix el full o desa'l com a PDF">Imprimir / PDF</button>
            <button className="btn" type="button" disabled={!has} onClick={exportHtml} title="Baixa un fitxer HTML que s'obre i imprimeix el full">HTML</button>
            <button className="btn" type="button" disabled={!has} onClick={() => download(slug(song.title) + ".txt", chordPro(song))} title="Baixa la cançó en format ChordPro">ChordPro</button>
            <StatusIcon status={shownStatus} />
          </div>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>{readOnly ? "Connexió" : "Editar"}</button>
            <button type="button" role="tab" aria-selected={tab === "sheet"} onClick={() => setTab("sheet")}>Full</button>
          </div>
        </div>
      </header>

      <main>
        <section className="col edit-col" aria-label="Editor">
          {readOnly ? connection : <Editor
            key={cur || "none"}
            song={song}
            update={update}
            folders={folders}
            onNew={() => addSong(blankSong())}
            onExample={() => addSong(exampleSong())}
            onDelete={deleteSong}
            focusId={focusId}
            onFocused={onFocused}
            backup={<Backup onExportAll={exportAll} onImport={importFile} canExport={Object.values(songs).some(isLive)} />}
            connection={connection}
          />}
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
