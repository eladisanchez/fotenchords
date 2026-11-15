import { useState } from "react";

const SYNC_TEXT = {
  synced: "Sincronitzat",
  pending: "Hi ha canvis pendents de pujar",
  syncing: "Sincronitzant…",
  offline: "Sense connexió. Els canvis es desen aquí i es pujaran quan torni la xarxa.",
  error: "Error de sincronització. Es tornarà a provar.",
  auth: "La contrasenya ja no és vàlida. Torna a entrar."
};

/** Remote connection card: shared password in, role and sync state out. */
export default function Connection({ auth, sync, onConnect, onDisconnect, onSync, onGuest }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (auth?.guest) {
    return (
      <div className="card"><h2>Connexió</h2>
        <p className="notice" style={{ margin: 0 }}>Mode <strong>convidat</strong>. Les cançons només es desen en aquest dispositiu i no se sincronitzen.</p>
        <div className="add-row">
          <button className="btn primary" type="button" onClick={onDisconnect}>Entra amb contrasenya</button>
        </div>
      </div>
    );
  }

  if (auth) {
    return (
      <div className="card"><h2>Connexió</h2>
        <p className="notice" style={{ margin: 0 }}>
          Connectat com a <strong>{auth.canEdit ? "editor" : "lector"}</strong>.{" "}
          {auth.canEdit ? "Els canvis es pugen sols i la banda els veu." : "Pots veure i imprimir les cançons, però no editar-les."}
        </p>
        {sync ? <p className={"notice" + (sync === "error" || sync === "auth" ? " bad" : "")} style={{ margin: 0 }}>{SYNC_TEXT[sync]}</p> : null}
        <div className="add-row">
          <button className="btn" type="button" onClick={onSync} disabled={sync === "syncing"}>Sincronitza ara</button>
          <button className="btn danger" type="button" onClick={onDisconnect}>Tanca la sessió</button>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const err = await onConnect(password);
    setBusy(false);
    if (err) setError(err); else setPassword("");
  };

  return (
    <form className="card" onSubmit={submit}><h2>Entra</h2>
      <p className="notice" style={{ margin: 0 }}>Escriu la contrasenya d'edició per editar les cançons, o la de lectura per veure-les i imprimir-les.</p>
      <div className="field">
        <label htmlFor="conn-pw">Contrasenya</label>
        <input type="password" id="conn-pw" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? <p className="notice bad" style={{ margin: 0 }} role="alert">{error}</p> : null}
      <div className="add-row">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Entrant…" : "Entra"}</button>
        {onGuest ? <button className="btn" type="button" onClick={onGuest} disabled={busy}>Entra com a convidat</button> : null}
      </div>
    </form>
  );
}
