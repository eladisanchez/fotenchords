# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FotenChords: a PWA (React 19 + Vite 8 + `vite-plugin-pwa`) for writing rehearsal chord sheets (lyrics with chords) and printing them. UI text is in Catalan; keep new UI strings in Catalan. Plain JS/JSX, no TypeScript, no tests, no linter.

`legacy/guions-original.html` is the original single-file claude.ai artifact this was ported from. It is reference only, not part of the build.

## Commands

- `npm run dev`: dev server. The service worker is **not** active in dev.
- `npm run build`: production build into `dist/`, generating `sw.js`, `manifest.webmanifest` and the Workbox precache.
- `npm run preview`: serve `dist/`. Use this to test PWA, offline and install behaviour.
- `vercel dev`: dev server with the `/api` functions (needs `vercel link` and `vercel env pull .env.local` first). Plain `npm run dev` has no API, so remote sync reports offline.
- `npm run icons`: regenerate the PNG icons in `public/` from `public/favicon.svg` (config: `pwa-assets.config.js`). Icon file names are referenced in `vite.config.js` and `index.html`.

## Architecture

- **`api/songs.js`**: Vercel function. The whole map is one **private** Vercel Blob, `songs.json`. `GET` returns `{ songs, canEdit }`; `PUT` takes only the changed songs, merges them with `mergeNewest` and writes with `ifMatch` (retries on conflict). Passwords come from env `EDIT_PASSWORD` and optional `READ_PASSWORD`; a password is always required, there is no anonymous access; the client sends `Authorization: Bearer <encodeURIComponent(pw)>`. It imports `src/lib/storage.js`, so that file must stay importable in Node (no top-level browser globals).

- **`src/lib/song.js`**: pure song logic with no React.
  - Song model: `{ title, artist, key, bpm, capo, time, size, two, folder?, updatedAt, sections: [{ id, type, label, times, text, ref? }] }`.
  - Folders are derived from the songs' `folder` field (`folderOf()`, `listFolders()`); there is no separate folder list. The top-bar folder filter is a per-device preference in localStorage `guions.folder`.
  - A `rep` section has no text. It points at an earlier written section through `ref`.
  - Labels such as "Estrofa 2" are derived by `autoLabels()` and never stored.
  - `parseText()` classifies each line as `gap`, `tab`, `note`, `chordrow` or `line`. Chords are written inline as `[Am]`.
  - `transpose()` mutates a song: it shifts the key and every chord, choosing sharps or flats via `FLAT_KEYS`.
  - `chordPro()` builds the ChordPro export.
- **`src/App.jsx`**: owns all state. `songs` is a `{ [id]: song }` map and `cur` is the open id.
  - Every edit goes through `update(fn, focusId?)`, which `structuredClone`s the current song, mutates the clone and stamps `updatedAt`. Any change to the songs map must set `dirty.current = true`, or it won't be saved.
  - Persistence writes the whole map to `localStorage` key `guions.songs.v1`, debounced by 700 ms. Set `immediate.current` to write at once instead.
  - A pending save is flushed on `beforeunload`, when the page is hidden (`visibilitychange`), when switching songs and before printing.
  - **Deletes are tombstones** `{ deleted: true, updatedAt }` kept in the map, so they sync. Everything that lists or picks songs must skip them with `isLive()` (from `song.js`).
  - **Login is mandatory**: with no saved auth, `App` renders only the login screen (`Connection` with `auth={null}`). A 401 from the server clears the saved auth and returns to it. **Remote sync**: every mutation adds its id to `pending`. After a local `flush()`, a push is scheduled (4 s debounce), and one is sent at once when the page is hidden. A pull (`GET` + `mergeNewest`) runs at start, when the page becomes visible and on `online`; as editor it also queues every local song that is newer or missing remotely, which is how existing local songs migrate up.
  - **Reader mode** (`canEdit === false`): the editor column shows only the Connexió card, editing controls are disabled and `update()` is a no-op.
  - A `storage` event listener syncs other tabs, but keeps the song being edited while it is dirty. `fromStorage` stops a write-back ping-pong.
- **`src/lib/remote.js`**: `fetchRemote` / `pushRemote`; every call resolves to `{ ok, … }` or `{ ok: false, error: "offline" | "auth" | "server" }`.
- **`src/lib/storage.js`**: localStorage I/O, `download()` (Blob + `<a download>`), and JSON backup import/export. `parseBackup` accepts a `{id: song}` map, a `{songs: …}` wrapper, or an array, and `mergeNewest` merges by `updatedAt`. `liveSongs()` drops tombstones; `loadAuth`/`saveAuth` keep the connection (`{ password, canEdit }`) in `guions.auth.v1`.
- **`src/components/Sheet.jsx`**: renders the printed sheet as JSX, with no `innerHTML`. `SheetContent` is shared with **`src/lib/exportHtml.jsx`**, which uses `react-dom/server`, so the downloadable print-ready HTML and the preview can't drift apart.
- **`src/components/Editor.jsx`**: section cards and the backup card. The `Editor` is keyed by song id in `App`.

## CSS

- `src/styles/sheet.css` styles `.sheet` only, with its own `--s-*` variables and its own `@media print`. It is also inlined into the HTML export through `?raw`, so it must stay self-contained.
- `src/styles/app.css` holds the app theme tokens on `:root`. There are two dark-mode blocks: `prefers-color-scheme` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Keep them in sync.
- The `@media print` block at the end of `app.css` hides the app chrome so `window.print()` prints only the sheet, including from the mobile "Editar" tab.
- The top bar class is `.topbar`. `.bar` belongs to the bar-line spans inside the sheet's chord rows.
- The mobile tabs use `body[data-tab]`, which is set from `App`.

## Fonts

Fonts are self-hosted through `@fontsource/*` so the app works offline. Import them **without** the `.css` extension (e.g. `@fontsource/big-shoulders-display/700`), because the package `exports` map adds it. The HTML export still links Google Fonts, since it is a standalone file.
