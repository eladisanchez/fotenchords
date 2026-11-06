# Pla: emmagatzematge remot de cançons (Vercel + Vercel Blob)

## Context
Ara les cançons només viuen al `localStorage` de cada dispositiu (`src/lib/storage.js`, clau `guions.songs.v1`). L'objectiu és allotjar la PWA a Vercel (gratuït) i guardar les cançons en remot com a JSON, perquè:
- **jo (editor)** pugui editar des de qualsevol dispositiu;
- **la banda (lectors)** vegi i imprimeixi les cançons, sense editar-les.

Decisions preses: Vercel Blob per guardar, contrasenya compartida (sense comptes), rols editor/lector.

## Disseny

### Emmagatzematge: un sol fitxer `songs.json` a Vercel Blob
- Conté tot el mapa `{ [id]: song }`, el mateix format que el `localStorage` i l'exportació JSON actuals.
- **Per què un sol fitxer i no un per cançó:** al pla gratuït les operacions "avançades" (`put`, `list`) són limitades. Amb un fitxer, llegir és un sol `fetch` sense `list`, i desar és un sol `put`. Hi ha un sol editor, així que reescriure el fitxer sencer no crea conflictes entre persones.
- **Esborrats:** es fan amb *tombstones*, `{ deleted: true, updatedAt }`, perquè un esborrat no "ressusciti" en fusionar amb un altre dispositiu. La interfície els amaga.
- **Fusió:** cada cançó guanya per `updatedAt`. Es reutilitza `mergeNewest()` de `src/lib/storage.js`.

### API: una funció serverless, `api/songs.js` (Node, `@vercel/blob`)
- `GET /api/songs`
  - Si hi ha `READ_PASSWORD`, exigeix aquesta contrasenya o la d'edició.
  - Retorna `{ songs, canEdit }`. `canEdit` és cert si s'ha enviat la contrasenya d'edició.
- `PUT /api/songs`
  - Exigeix `EDIT_PASSWORD`.
  - Cos: `{ songs: { [id]: song } }`, només les cançons canviades.
  - Llegeix el `songs.json` actual, hi fusiona les canviades amb `mergeNewest`, fa `put` (`addRandomSuffix: false`, `allowOverwrite: true`) i retorna el mapa fusionat.
- La contrasenya viatja a la capçalera `Authorization: Bearer …` i es compara amb `crypto.timingSafeEqual`.
- Variables d'entorn a Vercel: `BLOB_READ_WRITE_TOKEN` (es crea sola en connectar el Blob store), `EDIT_PASSWORD` i `READ_PASSWORD` (opcional; sense ella, qualsevol amb l'URL pot llegir).
- La URL del blob no arriba mai al client: tot passa per la funció.
- **A verificar en implementar**, amb la documentació actual de `@vercel/blob`:
  - si hi ha store **privat** disponible. Si n'hi ha, fer-lo servir;
  - el retard de la caché CDN en sobreescriure (~60 s). Es mitiga amb cache-busting en llegir des de la funció.
  - Acceptable igualment: només hi ha un editor, i els lectors tolerarien un minut de retard.

### Client
- **`src/lib/remote.js` (nou):** `fetchRemote(password)` i `pushRemote(password, changedSongs)`. Gestionen els errors 401/xarxa i retornen un resultat tipat.
- **`localStorage` continua sent la caché local i el mode offline.** No canvia res de l'app quan no hi ha connexió remota configurada.
- **Sincronització a `src/App.jsx`:**
  - En arrencar, en tornar a primer pla (`visibilitychange` visible) i en l'esdeveniment `online`: `GET`, fusionar amb `mergeNewest` i desar al local.
  - Editor: després de cada `flush()` local, s'afegeixen els ids canviats a `pendingIds` (persistit a `localStorage`). Un push remot amb debounce de ~4 s (més llarg que el local, de 700 ms, per estalviar operacions) els envia. També es fa push en amagar la pàgina. Si falla, es reintenta en tornar `online`.
  - `deleteSong` passa a escriure un tombstone en lloc d'eliminar la clau.
  - La llista del selector, `pickLatest()` i la còpia JSON ignoren les cançons amb `deleted`.
- **Mode lector** (`canEdit === false`):
  - amaga la columna de l'editor i obre la pestanya "Full";
  - desactiva +Nova, To, Mida i 2 columnes;
  - manté Imprimir, HTML i ChordPro;
  - no fa cap push.
- **Configuració:** nova targeta **Connexió** a l'editor, i també un botó a l'estat buit per als lectors nous.
  - Camp de contrasenya; es desa a `localStorage` (`guions.auth.v1`).
  - Mostra el rol (Editor / Lector) i té un botó "Desconnecta".
- **Icona d'estat** (`src/components/StatusIcon.jsx`), amb nous estats: `synced` (núvol amb check), `pending` (núvol amb fletxa), `offline` (núvol ratllat) i `error`. El botó segueix fix, de 28 px.
- **Migració:** el primer push de l'editor puja totes les cançons locals (`pendingIds` = tots els ids no remots). Així no cal fer cap importació manual.

### Desplegament
- Afegir `vercel.json`:
  - és un projecte Vite: `outputDir: dist`;
  - les rutes `/api/*` van a les funcions;
  - capçalera `Cache-Control: no-cache` per a `sw.js`.
- Workbox no ha de cachejar `/api/*`: `navigateFallbackDenylist: [/^\/api\//]` a `vite.config.js`.
- Passos manuals (els faràs tu): `vercel` (vincular el projecte), crear el Blob store al dashboard, definir `EDIT_PASSWORD` i `READ_PASSWORD`, i `vercel --prod`.
- Desenvolupament local: `vercel dev` (serveix Vite i `/api` junts). Després `vercel env pull` per tenir el token en local.

## Fitxers
- Nous: `api/songs.js`, `src/lib/remote.js`, `src/components/Connection.jsx`, `vercel.json`.
- Modificats:
  - `src/App.jsx`: sync, tombstones, mode lector;
  - `src/lib/storage.js`: helper `liveSongs()` per filtrar tombstones, i `parseBackup`/`exportAll` que els ignorin;
  - `src/components/StatusIcon.jsx`;
  - `src/components/Editor.jsx`: targeta Connexió i lectura sola;
  - `vite.config.js`, `package.json` (`@vercel/blob`), `CLAUDE.md`.

## Verificació
1. `vercel dev` amb un Blob store de prova i les contrasenyes posades.
2. Editor, pestanya A: crear, editar i esborrar una cançó. Comprovar amb `GET /api/songs` (curl amb la capçalera) que el JSON es manté i que l'esborrat surt com a tombstone.
3. Una segona finestra del navegador amb un altre perfil, com a lector: veu les cançons, l'editor està amagat i els controls desactivats. Un `PUT` amb la contrasenya de lector retorna 401.
4. Contrasenya incorrecta: avís "Contrasenya incorrecta" i l'app continua funcionant en local.
5. Offline (servidor aturat o DevTools offline): editar; la icona passa a pendent/offline. En reconnectar, es fa el push.
6. Dos dispositius com a editor: canvis a cançons diferents es fusionen sense perdre res.
7. `npm run build` i comprovar que `sw.js` no intercepta `/api`.
8. Desplegament real a Vercel i prova des del mòbil (PWA instal·lada).
