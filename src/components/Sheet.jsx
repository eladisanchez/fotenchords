import { autoLabels, parseText, structureLine } from "../lib/song.js";

function SectionText({ text }) {
  return parseText(text).map((l, i) => {
    switch (l.kind) {
      case "gap": return <div key={i} className="gap" />;
      case "tab": return <div key={i} className="tab">{l.text}</div>;
      case "note": return <div key={i} className="note">{l.text}</div>;
      case "chordrow":
        return (
          <div key={i} className="chordrow">
            {l.parts.map((p, j) => <span key={j} className={p.kind === "chord" ? undefined : p.kind}>{p.text}</span>)}
          </div>
        );
      default:
        return (
          <div key={i} className={"line" + (l.hasChords ? "" : " nochords")}>
            {l.segs.map((s, j) => (
              <span key={j} className="seg">
                <span className="ch">{s.c}</span>
                <span className="ly">{s.t || (s.c ? " " : "")}</span>
              </span>
            ))}
          </div>
        );
    }
  });
}

const Times = ({ n }) => (Number(n) > 1 ? <span className="times">×{Number(n)}</span> : null);

/** Inner content of the printed sheet. Also rendered to static markup for the HTML export. */
export function SheetContent({ song }) {
  const labels = autoLabels(song);
  const meta = [["To", song.key], ["BPM", song.bpm], ["Compàs", song.time], ["Capo", song.capo]].filter(([, v]) => String(v || "").trim());
  return (
    <>
      <header className="s-head">
        <div>
          <h1 className="s-title">{song.title || "Sense títol"}</h1>
          {song.artist ? <p className="s-artist">{song.artist}</p> : null}
        </div>
        {meta.length ? (
          <dl className="s-meta">
            {meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        ) : null}
      </header>
      <div className="s-body">
        {song.sections.length ? song.sections.map((s) => {
          if (s.type === "rep") {
            const ref = song.sections.find((x) => x.id === s.ref);
            return (
              <section key={s.id} className="sec is-rep">
                <div className="sec-lab"><span className="tag light">Repeteix</span></div>
                <div className="rep">
                  <span className={"tag" + (ref?.type === "chorus" ? " chorus" : "")}>{ref ? labels[ref.id] : "—"}</span>
                  <Times n={s.times} />
                  <span>com a dalt</span>
                </div>
              </section>
            );
          }
          const tagCls = s.type === "chorus" ? " chorus" : s.type === "note" ? " light" : "";
          return (
            <section key={s.id} className={"sec" + (s.type === "chorus" ? " chorus" : "")}>
              <div className="sec-lab"><span className={"tag" + tagCls}>{labels[s.id]}</span><Times n={s.times} /></div>
              <div className="sec-txt"><SectionText text={s.text} /></div>
            </section>
          );
        }) : <p className="note">Afegeix una secció per començar.</p>}
      </div>
      <footer className="s-foot"><span>{song.title || ""}</span><span>{structureLine(song)}</span></footer>
    </>
  );
}

export default function Sheet({ song }) {
  if (!song) return <article className="sheet"><div className="s-body"><p className="note">Cap cançó oberta.</p></div></article>;
  return (
    <article className={"sheet" + (song.two ? " two" : "")} style={{ "--s-size": (song.size || 16) + "px" }}>
      <SheetContent song={song} />
    </article>
  );
}
