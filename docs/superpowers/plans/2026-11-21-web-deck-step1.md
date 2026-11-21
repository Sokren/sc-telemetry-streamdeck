# Appli web — Étape 1 : serveur, API v1, Swagger, page PC — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un serveur local autonome (`npm run start:web`) qui expose une API publique `v1` documentée en OpenAPI / Swagger UI et sert une page PC avec la grille par défaut, l'état en direct et les appuis.

**Architecture:** Nouveau dossier `src/web/` avec son propre point d'entrée (`src/web/server.ts`) et sa propre construction (`rollup.web.config.mjs` → `dist-web/`). Serveur `node:http` sans framework : routeur minimal, jeton, contrôleurs qui appellent les fonctions **partagées** existantes (`GameClient`, `TelemetryHub`, `ActionSource`, `buildDropdown`, `readValue`/`toView`, `readShipState`/`decidePress`/`renderShipKey`, `renderKeySvg`, `toToggleTimes`/`MorsePlayer`, `DANGEROUS_ACTIONS`). Contrat `src/web/openapi.json` (OpenAPI 3.1) vérifié par les tests. Page statique sans framework.

**Tech Stack:** Node 24, TypeScript strict, `node:http`, Server-Sent Events, `swagger-ui-dist` (servi en local), `ajv` (tests : réponses validées contre le contrat), vitest, rollup.

**Spec:** `docs/superpowers/specs/2026-11-21-web-deck-design.md`

## Global Constraints

- **Plugin Stream Deck intact** : aucun changement dans `src/actions/*`, `src/plugin.ts`, `com.sokren.sc-telemetry.sdPlugin/`, `rollup.config.mjs`. À **chaque** commit : `npm test` (toute la suite) vert, `npm run build` et `npx streamdeck validate com.sokren.sc-telemetry.sdPlugin` (seul l'avertissement de catégorie connu).
- Seules modifications hors `src/web/`, `tests/web/`, `rollup.web.config.mjs` : `package.json` (scripts `build:web`, `start:web`, dépendances), `.gitignore` (`dist-web/`), `README.md` / `README.fr.md`.
- Écoute **`127.0.0.1` seulement** dans cette étape ; port par défaut **8743** (réglage `port`).
- Réglages dans `%APPDATA%\SC Telemetry Deck\settings.json` (dossier injectable pour les tests) : `{ "port": 8743, "lan": false, "token": "<aléatoire>" }` ; jeton créé au premier lancement (`crypto.randomBytes(24).toString("base64url")`).
- Jeton exigé sur toutes les routes sauf `GET /api/docs*`, `GET /api/v1/openapi.json`, `GET /` et les fichiers statiques de la page ; absent ou faux → `401` `{ "error": "unauthorized" }`. Accepté en `Authorization: Bearer <jeton>` ou `?t=<jeton>`.
- Langue : `?lang=fr|en`, sinon `Accept-Language` (`fr…` → fr), sinon en.
- Actions dangereuses (`DANGEROUS_ACTIONS`) : jamais listées, jamais déclenchées (`403` `{ "error": "dangerous_action" }`).
- Descriptions du contrat OpenAPI **bilingues** (anglais puis français) ; textes de la page en FR / EN.
- Délais : déclenchement 2000 ms, liste des actions 1500 ms (comme le plugin).
- Commits en français + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push.

## Review Focus

1. **Requête sans jeton ou avec un mauvais jeton** sur chaque route protégée : `401`, aucune donnée, aucun déclenchement. → Task 1 (test parcourant toutes les routes du contrat).
2. **Action dangereuse demandée directement** (`POST /api/v1/actions/v_self_destruct/trigger`, appui de vaisseau trafiqué) : `403`, rien envoyé. → Task 2 + Task 3.
3. **Jeu fermé** : `status` le dit, constantes et fonctions « indisponibles / unknown », appuis en `502` avec la raison, serveur stable. → Task 2 + Task 3.
4. **Route ajoutée sans être documentée** (ou l'inverse) : test de contrat en échec. → Task 1.
5. **Client SSE qui se déconnecte** (onglet fermé) : plus d'écriture vers lui, pas de fuite d'abonnement au flux du jeu. → Task 5.

---

### Task 1: Socle — réglages, jeton, routeur, contrat OpenAPI, Swagger UI

**Files:** Create `src/web/config.ts`, `src/web/http.ts`, `src/web/app.ts`, `src/web/openapi.json` ; Modify `package.json`, `.gitignore` ; Test `tests/web/config.test.ts`, `tests/web/contract.test.ts`, `tests/web/harness.ts`

**Interfaces:**
- `type WebSettings = { port: number; lan: boolean; token: string }` ; `loadSettings(dir: string): WebSettings` (crée dossier et fichier si absents ; complète les champs manquants ; fichier illisible → réglages neufs, l'ancien renommé `settings.json.bak`).
- `type Route = { method: "GET" | "POST" | "PUT" | "DELETE"; path: string /* style OpenAPI, ex. /api/v1/actions/{name}/trigger */; public?: boolean; handle(ctx: Ctx): Promise<Reply> }` ; `type Ctx = { params: Record<string, string>; query: URLSearchParams; body: unknown; lang: Lang; req: IncomingMessage; res: ServerResponse }` ; `type Reply = { status: number; json?: unknown; text?: string; contentType?: string } | { stream: true }`.
- `createApp(deps: AppDeps): { routes: Route[]; handler(req, res): void }` — `AppDeps` grandit au fil des tâches (`settings`, puis `game`, `hub`, `source`, `morse`…).
- `GET /api/v1/status` → `{ app: "sc-telemetry-web", version: string, game: "connected" | "unreachable", character: "spawned" | "unknown", schema: string }` (`game` : flux reçu < 3 s ; `character` : section `actor` fraîche).
- `GET /api/v1/openapi.json` (public) ; `GET /api/docs` (public) → Swagger UI servie depuis `swagger-ui-dist`, configurée sur `/api/v1/openapi.json`, sans ressource externe.
- `tests/web/harness.ts` : `startTestServer(deps?): Promise<{ url: string; token: string; close(): Promise<void> }>` (port 0, dossier de réglages temporaire, faux jeu de `tests/game/fake-server.ts`), et `validateResponse(path, method, status, body)` (ajv 2020 sur les schémas du contrat).

- [ ] Tests config : création avec port 8743, `lan` faux, jeton ≥ 32 caractères ; relecture → même jeton ; fichier corrompu → réglages neufs + `.bak`.
- [ ] Tests contrat : l'ensemble des routes (méthode + chemin) de `createApp` est **égal** à l'ensemble des opérations de `openapi.json` ; chaque opération a des descriptions EN et FR ; toute route non publique répond `401` sans jeton et avec un mauvais jeton (aucun corps de données) ; `/api/docs` et `/api/v1/openapi.json` répondent `200` sans jeton ; `GET /api/v1/status` valide contre son schéma.
- [ ] RED, implémentation, GREEN ; `package.json` : scripts `build:web`, `start:web`, dépendances `swagger-ui-dist`, `ajv` (dev) ; garde-fou plugin ; commit `feat(web): socle du serveur, jeton, contrat OpenAPI et Swagger UI`.

### Task 2: Actions, constantes, télémétrie brute

**Files:** Create `src/web/routes/actions.ts`, `src/web/routes/vitals.ts`, `src/web/routes/telemetry.ts` ; Modify `src/web/app.ts`, `src/web/openapi.json` ; Test `tests/web/actions.test.ts`, `tests/web/vitals.test.ts`

**Interfaces:**
- `GET /api/v1/actions` → `{ live: boolean, groups: [{ category, label, actions: [{ name, label, holdable }] }] }` (toutes les catégories du jeu, dangereuses exclues ; source `ActionSource`).
- `POST /api/v1/actions/{name}/trigger` → `200 { ok: true }` ; dangereuse → `403` ; échec du jeu → `502 { ok: false, reason, message? }`.
- `GET /api/v1/vitals` → `[Vital]` ; `GET /api/v1/vitals/{id}` → `Vital` ou `404` ; `Vital = { id, label, available, text, unit, percent?, level: "ok"|"warn"|"bad"|"none" }` (de `readValue` + `toView`).
- `GET /api/v1/telemetry/{section}` → section brute fraîche, ou `404 { error: "no_data" }`.

- [ ] Tests (faux jeu) : liste sans aucune action dangereuse, libellés FR/EN selon `lang` ; déclenchement envoie exactement le nom ; `v_self_destruct` → 403 et rien envoyé ; jeu absent → 502 ; constantes « — » / `available: false` sans flux, valeurs après une frame du faux flux ; télémétrie 404 puis 200 ; toutes les réponses valident contre le contrat.
- [ ] RED, implémentation, GREEN, garde-fou plugin, commit `feat(web): API actions, constantes et télémétrie`.

### Task 3: Fonctions vaisseau et morse

**Files:** Create `src/web/routes/ship.ts`, `src/web/routes/morse.ts`, `src/web/morse-control.ts` ; Modify `src/web/app.ts`, `src/web/openapi.json` ; Test `tests/web/ship.test.ts`, `tests/web/morse.test.ts`

**Interfaces:**
- `GET /api/v1/ship/functions` → `[ShipFunctionState]` ; `GET …/{id}` → un ou `404` ; `ShipFunctionState = { id, name, label, state: ShipState, word }`.
- `POST /api/v1/ship/functions/{id}/press` corps `{ mode?: "toggle"|"on"|"off" }` → `200 { decision: "sent", action, ok: true }` | `200 { decision: "noop" }` | `409 { decision: "refused", reason }` | `502 { decision: "sent", action, ok: false, reason }` (via `decidePress`).
- `MorseControl` (même lecteur que le plugin, sa propre instance) : `start({ text, unitMs, repeat }): "started" | "empty"`, `stop(): boolean`, `playing: boolean`, `onChange(listener)`.
- `POST /api/v1/morse` corps `{ text?, unitMs?, repeat? }` (mêmes bornes et défauts que la touche) → `202` | `409 { error: "already_playing" }` | `422 { error: "nothing_to_send" }` ; `DELETE /api/v1/morse` → `204` | `404`.

- [ ] Tests : état des fonctions sur la frame du Titan (fixture) ; press gear (sorti) → `v_retract_landing_system` ; état atteint → noop ; `doors_closed` sur Titan → 409 ; jeu en erreur → 502 ; morse démarre, 409 si en cours, DELETE arrête et remet la torche, 422 pour « ??? » ; réponses validées contre le contrat.
- [ ] RED, implémentation, GREEN, garde-fou plugin, commit `feat(web): API vaisseau et morse`.

### Task 4: Tuiles et grille

**Files:** Create `src/web/tiles.ts`, `src/web/tile-render.ts`, `src/web/layout.ts`, `src/web/routes/layout.ts` ; Modify `src/web/app.ts`, `src/web/openapi.json` ; Test `tests/web/tiles.test.ts`, `tests/web/layout.test.ts`

**Interfaces:**
- `type Tile = { type: "actor-action" | "actor-display" | "ship-toggle" | "ship-action" | "morse"; settings: object }` (réglages identiques à ceux du plugin) ; `DEFAULT_LAYOUT: Tile[]` = Train, Phares, Découplage, Mode NAV, Moteurs, Oxygène, Santé, Température corporelle, Faire coucou (`emote_wave`), Morse SOS.
- `renderTile(tile, ctx: { hub, lang, morsePlaying }): string` (data URI SVG) — ship-toggle → `renderShipKey`, actor-display → `renderKeySvg`, autres → `renderLabelTile({ label, kind, active })` (nouveau rendu : libellé du catalogue, icône du type, « ● » si morse en cours).
- `pressTile(tile, deps): Promise<{ feedback: "ok" | "alert", detail? }>` (mêmes règles que les routes : `decidePress`, `DANGEROUS_ACTIONS`, morse start/stop).
- `GET /api/v1/layout` → `{ tiles: [Tile & { image: string }] }` ; `POST /api/v1/layout/tiles/{index}/press` → `{ feedback, detail? }` ou `404`.

- [ ] Tests : grille par défaut (10 tuiles, réglages valides) ; chaque type rend une image SVG contenant son libellé FR / EN ; tuile ship-toggle identique à `renderShipKey` ; appui tuile gear → retract ; tuile avec action dangereuse trafiquée → `alert`, rien envoyé ; index hors grille → 404 ; contrat.
- [ ] RED, implémentation, GREEN, garde-fou plugin, commit `feat(web): tuiles et grille par défaut`.

### Task 5: Temps réel (Server-Sent Events)

**Files:** Create `src/web/events.ts` ; Modify `src/web/app.ts`, `src/web/openapi.json` ; Test `tests/web/events.test.ts`

**Interfaces:**
- `GET /api/v1/events?lang=` (SSE, jeton exigé) : événements `status` (objet de `/status` quand il change), `tile` `{ index, image }` (seulement les tuiles dont l'image change), `feedback` `{ index, feedback }` (après un appui de tuile), `state` `{ vitals: [Vital], ship: [ShipFunctionState] }` (≤ 4 / s, seulement si changé) ; commentaire `: ping` toutes les 15 s.
- Un abonnement au `TelemetryHub` tant qu'au moins un client SSE est connecté ; désabonnement à la déconnexion du dernier.

- [ ] Tests : connexion → `status` + toutes les tuiles ; frame du faux flux → `tile` des tuiles concernées seulement + `state` ; appui de tuile → `feedback` aux clients ; déconnexion → plus d'écriture, hub désabonné quand plus aucun client ; sans jeton → 401.
- [ ] RED, implémentation, GREEN, garde-fou plugin, commit `feat(web): événements temps réel`.

### Task 6: Page, point d'entrée, construction, documentation

**Files:** Create `src/web/server.ts`, `src/web/static/index.html`, `src/web/static/app.js`, `src/web/static/style.css`, `src/web/static/i18n.js`, `rollup.web.config.mjs` ; Modify `README.md`, `README.fr.md` ; Test `tests/web/static.test.ts`, `tests/web/server.test.ts`

**Interfaces:**
- `src/web/server.ts` : charge les réglages, crée `GameClient` (`createGameApi`), `TelemetryHub`, `ActionSource`, `MorseControl`, écoute `127.0.0.1:port`, affiche l'adresse (FR / EN) et ouvre le navigateur sur `http://127.0.0.1:<port>/?t=<jeton>`.
- Page : récupère le jeton (`?t=` → `localStorage`, puis retire `t` de l'URL), s'abonne à `/api/v1/events`, affiche la grille (images des tuiles), envoie `POST …/tiles/{index}/press` au clic / toucher, affiche ✔ / ⚠ brièvement, indicateur de connexion au jeu, bouton FR / EN, lien « API / Swagger ». Aucun texte sans traduction.
- `rollup.web.config.mjs` : `src/web/server.ts` → `dist-web/server.mjs`, copie `static/`, `openapi.json`, `schema/sc_extrait.desc`, `schema/actions.json`.

- [ ] Tests : `GET /` sert la page sans jeton ; les fichiers statiques sont servis avec le bon type ; chaque clé de texte de `i18n.js` existe en FR et en EN ; `server.ts` démarre sur un port libre avec un dossier de réglages temporaire et répond à `/api/v1/status`.
- [ ] RED, implémentation, GREEN ; `npm run build:web` ; essai manuel : `npm run start:web`, page ouverte, Swagger UI accessible.
- [ ] README FR / EN : section « Appli web et API (aperçu) » (lancement, jeton, Swagger) ; garde-fou plugin ; commit `feat(web): page PC, point d'entrée et construction`.
