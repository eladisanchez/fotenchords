// Fixed-size save/sync indicator: the toolbar never reflows when the state changes.
const CLOUD = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";
const ICONS = {
  saved: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16 9.8" />
    </>
  ),
  saving: <path className="spin" d="M12 3a9 9 0 1 0 9 9" />,
  synced: (
    <>
      <path d={CLOUD} />
      <path d="m9.5 14.5 2 2 3.5-3.5" />
    </>
  ),
  pending: (
    <>
      <path d={CLOUD} />
      <path d="M12.5 17.5v-5M10.3 14.7l2.2-2.2 2.2 2.2" />
    </>
  ),
  offline: (
    <>
      <path d={CLOUD} />
      <path d="m3 3 18 18" />
    </>
  ),
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
