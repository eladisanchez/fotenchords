# FotenChords

Aplicació web (PWA) per escriure guions d'assaig: lletra amb els acords a sobre, estructura de la cançó, transposició i full llest per imprimir. Funciona sense connexió i es pot instal·lar al mòbil o a l'ordinador.

## Funcionalitats

- Editor per seccions: intro, estrofa, pre-tornada, tornada, pont, solo, instrumental, outro, nota i repetició.
- Repeticions ("Repeteix Tornada ×2, com a dalt") sense haver de tornar a escriure la secció.
- Etiquetes automàtiques (Estrofa 1, Estrofa 2…) i línia d'estructura al peu del full.
- Transposició de mig to en mig to, que canvia el to i tots els acords.
- Mida de lletra ajustable i opció de dues columnes.
- Previsualització en directe del full tal com s'imprimirà (A4).
- Exportació: impressió o PDF, fitxer HTML que s'imprimeix sol i format ChordPro (`.txt`).
- Còpia de seguretat: exporta i importa totes les cançons en JSON.

## Com s'escriuen les cançons

| Escrius                 | Resultat                                         |
| ----------------------- | ------------------------------------------------ |
| `[Am]Quan la [F]nit`    | L'acord queda just a sobre de la síl·laba.       |
| `\| [D] \| [A] \|`      | Línia només d'acords, amb compassos.             |
| `e\|--5-7--\|`          | Tabulatura en lletra monoespaiada, ben alineada. |
| `(x2 al final)`         | Nota en cursiva.                                 |

## Desenvolupament

Cal Node.js 20 o superior.

```sh
npm install
npm run dev       # servidor de desenvolupament (sense service worker)
npm run build     # build de producció a dist/
npm run preview   # serveix dist/; per provar la PWA i el mode offline
npm run icons     # regenera les icones PNG a partir de public/favicon.svg
```

Tecnologia: React 19, Vite 8 i `vite-plugin-pwa` (Workbox). Les fonts van dins l'app amb `@fontsource`, perquè funcionin sense connexió.

## Estructura

```
src/
  App.jsx               estat, desat i barra d'eines
  components/
    Editor.jsx          targetes de secció i còpia de seguretat
    Sheet.jsx           el full imprès
    StatusIcon.jsx      indicador de desat
  lib/
    song.js             model de cançó, parseig d'acords, transposició, ChordPro
    storage.js          localStorage, descàrregues, importació i exportació JSON
    exportHtml.jsx      HTML autònom per imprimir
  styles/
    app.css             interfície (temes clar i fosc)
    sheet.css           estil del full; també s'insereix a l'export HTML
public/                 icones i favicon
legacy/                 versió original en un sol fitxer HTML (només de referència)
docs/                   plans i documentació
```

## Dades

Ara mateix les cançons es desen només al dispositiu (`localStorage`). Per passar-les a un altre aparell o tenir-ne còpia, fes servir **Còpia de seguretat → Exporta totes (JSON)** i després **Importa…** a l'altre dispositiu.

Hi ha un pla per desar-les en remot amb Vercel Blob, amb rols d'editor i lector: [docs/pla-emmagatzematge-remot.md](docs/pla-emmagatzematge-remot.md).
