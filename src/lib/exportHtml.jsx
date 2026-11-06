// Builds the downloadable print-ready HTML from the same <SheetContent> as the preview.
import { renderToStaticMarkup } from "react-dom/server";
import sheetCss from "../styles/sheet.css?raw";
import { SheetContent } from "../components/Sheet.jsx";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A self-contained HTML file that opens the print dialog once fonts load. */
export function standaloneHTML(song) {
  const body = renderToStaticMarkup(<SheetContent song={song} />);
  return `<!doctype html><html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(song.title || "Guió")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Atkinson+Hyperlegible+Mono:wght@500;700&family=Big+Shoulders+Display:wght@700;800&display=swap">
<style>html,body{margin:0;background:#e9ebef;font-family:system-ui,sans-serif}body{padding:24px 16px}${sheetCss}</style></head>
<body><article class="sheet${song.two ? " two" : ""}" style="--s-size:${Number(song.size) || 16}px">${body}</article>
<script>(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},300)});<\/script></body></html>`;
}
