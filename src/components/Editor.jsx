import { useEffect, useRef, useState } from "react";
import { TYPES, TYPE_NAME, autoLabels, defaultRepRef, repTargets, uid } from "../lib/song.js";

/** Textarea whose row count grows with its content but never shrinks while mounted. */
function Lyrics({ id, value, onChange }) {
  const [rows, setRows] = useState(() => Math.max(3, String(value || "").split("\n").length + 1));
  useEffect(() => {
    const need = String(value || "").split("\n").length + 1;
    if (need > rows) setRows(need);
  }, [value, rows]);
  return (
    <textarea
      className="lyrics" id={id} spellCheck={false} rows={rows} value={value || ""}
      placeholder="[Am]Escriu la lletra amb els [F]acords entre claudàtors"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Two-tap delete: first tap arms the button for 4 s. */
function DeleteSong({ onDelete }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={"btn danger" + (armed ? " armed" : "")} type="button" onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? "Segur? Toca per esborrar" : "Esborra aquesta cançó"}
    </button>
  );
}

export function Backup({ onExportAll, onImport, canExport }) {
  const fileRef = useRef(null);
  return (
    <div className="card"><h2>Còpia de seguretat</h2>
      <p className="notice" style={{ margin: 0 }}>Les cançons es desen en aquest dispositiu. Exporta-les per tenir-ne còpia o passar-les a un altre aparell.</p>
      <div className="add-row">
        <button className="btn" type="button" onClick={onExportAll} disabled={!canExport}>Exporta totes (JSON)</button>
        <button className="btn" type="button" onClick={() => fileRef.current?.click()}>Importa…</button>
        <input
          ref={fileRef} className="file-input" type="file" accept="application/json,.json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

export default function Editor({ song, update, folders = [], onNew, onExample, onDelete, backup, focusId, onFocused }) {
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    onFocused();
  }, [focusId, onFocused]);

  if (!song) {
    return (
      <>
        <div className="card empty">
          <div className="big">Cap guió encara</div>
          <p>Crea una cançó nova o carrega l'exemple per veure com s'escriuen els acords sobre la lletra.</p>
          <div className="add-row" style={{ justifyContent: "center" }}>
            <button className="btn primary" type="button" onClick={onNew}>+ Cançó nova</button>
            <button className="btn" type="button" onClick={onExample}>Carrega l'exemple</button>
          </div>
        </div>
        {backup}
      </>
    );
  }

  const labels = autoLabels(song);
  const setMeta = (k) => (e) => { const v = e.target.value; update((s) => { s[k] = v; }); };
  const setSec = (id, fn) => update((s) => { const sec = s.sections.find((x) => x.id === id); if (sec) fn(sec, s); });

  const move = (i, d) => update((s) => {
    const j = i + d; if (j < 0 || j >= s.sections.length) return;
    [s.sections[i], s.sections[j]] = [s.sections[j], s.sections[i]];
  });
  const delSec = (id) => update((s) => {
    s.sections = s.sections.filter((x) => x.id !== id);
    for (const x of s.sections) if (x.type === "rep" && x.ref === id) x.ref = "";
  });
  const addSec = (type) => {
    const sec = { id: uid(), type, label: "", times: 1, text: "" };
    update((s) => { if (type === "rep") sec.ref = defaultRepRef(s.sections); s.sections.push(sec); }, "tx-" + sec.id);
  };

  const meta = [
    ["title", "Títol", "wide"], ["artist", "Artista", "wide"], ["key", "To", "", "Am"],
    ["bpm", "BPM", "", "", "numeric"], ["time", "Compàs", "", "4/4"], ["capo", "Capo", "", "", "numeric"]
  ];

  return (
    <>
      <div className="card"><h2>Cançó</h2>
        <div className="meta-grid">
          {meta.map(([k, label, cls, ph, im]) => (
            <div key={k} className={"field" + (cls ? " " + cls : "")}>
              <label htmlFor={"m-" + k}>{label}</label>
              <input type="text" id={"m-" + k} value={song[k] || ""} placeholder={ph || undefined} inputMode={im || undefined} onChange={setMeta(k)} />
            </div>
          ))}
          <div className="field wide">
            <label htmlFor="m-folder">Carpeta</label>
            <input
              type="text" id="m-folder" list="folder-list" value={song.folder || ""} placeholder="Cap (escriu un nom per crear-ne una)"
              onChange={setMeta("folder")}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== e.target.value) update((s) => { s.folder = v; }); }}
            />
            <datalist id="folder-list">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </div>
        </div>
      </div>

      {song.sections.map((s, i) => {
        const targets = s.type === "rep" ? repTargets(song.sections, i) : null;
        return (
          <div key={s.id} className="card sec-card">
            <div className="sec-head">
              <select
                className="type" aria-label="Tipus de secció" value={s.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setSec(s.id, (sec, sg) => {
                    sec.type = type;
                    if (type === "rep" && !sec.ref) sec.ref = defaultRepRef(sg.sections.slice(0, sg.sections.indexOf(sec)));
                  });
                }}
              >
                {TYPES.map(([v]) => <option key={v} value={v}>{TYPE_NAME[v]}</option>)}
              </select>
              {s.type === "rep" ? null : (
                <input
                  type="text" className="label" aria-label="Nom de la secció" value={s.label || ""} placeholder={labels[s.id] || ""}
                  onChange={(e) => { const v = e.target.value; setSec(s.id, (sec) => { sec.label = v; }); }}
                />
              )}
              <select
                className="times" aria-label="Repeticions" value={String(Number(s.times) || 1)}
                onChange={(e) => { const v = Number(e.target.value); setSec(s.id, (sec) => { sec.times = v; }); }}
              >
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>×{n}</option>)}
              </select>
              <span className="moves">
                <button className="btn icon" type="button" aria-label="Puja la secció" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn icon" type="button" aria-label="Baixa la secció" disabled={i === song.sections.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn icon danger" type="button" aria-label="Esborra la secció" onClick={() => delSec(s.id)}>✕</button>
              </span>
            </div>
            {s.type === "rep" ? (
              <div className="rep-row">
                Repeteix{" "}
                <select
                  aria-label="Secció a repetir" value={s.ref || ""}
                  onChange={(e) => { const v = e.target.value; setSec(s.id, (sec) => { sec.ref = v; }); }}
                >
                  {targets.length
                    ? <>{!targets.some((x) => x.id === s.ref) && <option value="">—</option>}
                        {targets.map((x) => <option key={x.id} value={x.id}>{labels[x.id]}</option>)}</>
                    : <option value="">(no hi ha seccions abans)</option>}
                </select>{" "}
                sense tornar-la a escriure.
              </div>
            ) : (
              <Lyrics id={"tx-" + s.id} value={s.text} onChange={(v) => setSec(s.id, (sec) => { sec.text = v; })} />
            )}
          </div>
        );
      })}

      <div className="card"><h2>Afegeix una secció</h2>
        <div className="add-row">
          {TYPES.map(([v, n]) => <button key={v} className="btn" type="button" onClick={() => addSec(v)}>+ {n}</button>)}
        </div>
      </div>

      <div className="card help"><h2>Com s'escriu</h2>
        <dl>
          <dt><code>[Am]Quan la [F]nit</code></dt><dd>L'acord queda just a sobre de la síl·laba.</dd>
          <dt><code>| [D] | [A] |</code></dt><dd>Línia només d'acords, amb compassos.</dd>
          <dt><code>e|--5-7--|</code></dt><dd>Tabulatura, es manté alineada.</dd>
          <dt><code>(x2 al final)</code></dt><dd>Nota entre parèntesis, en cursiva.</dd>
        </dl>
      </div>

      {backup}

      <div className="card"><h2>Esborra</h2>
        <div className="add-row"><DeleteSong onDelete={onDelete} /></div>
      </div>
    </>
  );
}
