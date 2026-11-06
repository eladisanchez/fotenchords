// Fixed-size save indicator: the toolbar never reflows when the save state changes.
const ICONS = {
  saved: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16 9.8" />
    </>
  ),
  saving: <path className="spin" d="M12 3a9 9 0 1 0 9 9" />,
  error: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </>
  )
};

export default function StatusIcon({ status }) {
  return (
    <span className={"status " + status.kind} title={status.text}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[status.kind] || ICONS.saved}
      </svg>
      <span className="sr-only">{status.text}</span>
    </span>
  );
}
