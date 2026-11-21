# Vues multiples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plusieurs vues « Ma vue », une par onglet (＋ pour en créer), renommables / supprimables, chacune enregistrée séparément, ouvrables par `?view=<id>`.

**Architecture:** `view.json` passe en `version: 2` (`views[]`) ; `ViewStore` devient un magasin de vues avec création / modification / suppression unitaires ; quatre routes `/api/v1/views…` remplacent `/api/v1/view` ; l'événement SSE `view` devient `views`. La page génère un onglet par vue ; `view.js` affiche la vue sélectionnée.

**Tech Stack:** TypeScript (Node ≥ 24, node:http), vitest, page en JS module sans bibliothèque.

**Spec:** `docs/superpowers/specs/2026-11-21-vues-multiples-design.md` (étend `2026-11-21-ma-vue-design.md`)

## Global Constraints

- Plugin Stream Deck et onglets Grille / Personnage / Vaisseau inchangés ; `npm test`, `npm run build`, `npm run build:web`, `npx streamdeck validate com.sokren.sc-telemetry.sdPlugin` verts.
- Tout texte visible FR + EN (`i18n.js`, parité des clés) ; descriptions OpenAPI avec « — FR : ».
- **Aucun commit** sans l'accord de Remi. Branche `feat/ma-vue`, par-dessus « Ma vue » non commité.
- Limites : **10 vues au plus, au moins 1** ; nom ≤ **24** caractères, bords retirés, vide → « Vue » / « View » ; sections / cases : règles de `parseView` actuelles, ids uniques **par vue**.
- Id de vue créé par le serveur, `^[A-Za-z0-9_-]{1,32}$`, jamais réutilisé ; vue du premier lancement : id `main`.
- Contrat OpenAPI reste `1.2.0` (non publié) ; `/api/v1/view` et l'événement `view` disparaissent.

## Review Focus

- `view.json` de l'ancien format (`version: 1`, la vue de test de Remi) → relu comme vue `main`, sections intactes (test Task 1).
- Deux écrans : PUT de la vue A puis PUT de la vue B → les deux sont gardées (test Task 2).
- Vue supprimée pendant qu'un autre écran l'affiche → cet écran bascule sur la première vue, sans PUT qui la recrée (PUT sur id inconnu → 404, test Task 2 ; bascule, Task 3).
- `?view=<id inconnu>` → première vue, pas de panneau vide (Task 3, essai navigateur).
- Nom par défaut de `main` : suit la langue tant que rien n'est écrit, figé ensuite (test Task 1).

---

### Task 1: Modèle et magasin des vues

**Files:**
- Modify: `src/web/view.ts`
- Test: `tests/web/view.test.ts`

**Interfaces:**
- Produces :
  - `type View = { version: 1; sections: ViewSection[] }` **renommé** `Layout = { sections: ViewSection[] }` ; `type NamedView = { id: string; name: string; sections: ViewSection[] }`.
  - `MAX_VIEWS = 10`, `MAX_NAME = 24`.
  - `defaultLayout(lang): Layout` (sections de l'actuel `defaultView`) ; `defaultName(lang)` → « Ma vue » / « My view » ; `emptyName(lang)` → « Vue » / « View ».
  - `parseViewInput(x: unknown, lang: Lang): { name: string; sections: ViewSection[] } | undefined` — corps de PUT / POST (`sections` facultatif au POST → `[]`) ; réutilise `parseSection` et l'unicité des ids.
  - `class ViewStore { constructor(file?: string); list(lang): NamedView[]; create(name: string, lang): NamedView | "too_many"; update(id, input, lang): NamedView | "unknown"; remove(id, lang): true | "unknown" | "last"; onChange(fn: () => void): () => void }`.
  - Ids créés : `v` + 6 caractères base36 aléatoires, retiré si déjà pris.

- [ ] **Step 1: Tests** (remplacent ceux de `ViewStore` / `defaultView`, garder les 12 refus en les passant par `parseViewInput`) :
  - `new ViewStore().list("fr")` → `[{ id: "main", name: "Ma vue", sections: defaultLayout("fr").sections }]` ; `list("en")[0].name === "My view"`.
  - `create("Vol", "fr")` ×9 OK puis 10e → `"too_many"` (1 + 9 = 10).
  - `update("main", { name: "  " , sections: [] }, "en").name === "View"` ; nom de 50 car. → 24.
  - `remove` de la seule vue → `"last"` ; `remove("nope")` → `"unknown"` ; `update("nope", …)` → `"unknown"`.
  - Ids des vues créées : uniques, respectent la regex, ≠ `main`.
  - Nom de `main` : `list("en")` → « My view » avant toute écriture ; après `create("X", "fr")`, `list("en")[0].name === "Ma vue"` (figé) et le fichier contient `version: 2`.
  - Fichier `{ version: 1, sections: [...] }` → `list("fr")[0]` = `{ id: "main", name: "Ma vue", sections }` identiques.
  - Fichier illisible → défaut + `.bak` (test existant adapté) ; `onChange` appelé sur create / update / remove.
- [ ] **Step 2:** `npx vitest run tests/web/view.test.ts` → échec.
- [ ] **Step 3:** Implémenter. Le magasin garde `#views: NamedView[] | undefined` (undefined = rien d'écrit en v2) et, pour l'ancien format, `#legacy: ViewSection[]` ; toute écriture matérialise d'abord la liste avec le nom de `main` dans la langue reçue.
- [ ] **Step 4:** → vert.

### Task 2: Routes, SSE, contrat

**Files:**
- Modify: `src/web/routes/view.ts` (→ `viewsRoutes`), `src/web/app.ts`, `src/web/events.ts` (`view` → `views`), `src/web/openapi.json`
- Test: `tests/web/view-api.test.ts` (réécrit)

**Interfaces:**
- Consumes : `ViewStore`, `parseViewInput` (Task 1).
- Produces :
  - `GET /api/v1/views` → 200 `{ views: NamedView[] }`
  - `POST /api/v1/views` `{ name, sections? }` → 201 `NamedView` | 409 `{ error: "too_many_views" }` | 400 `{ error: "invalid_view" }`
  - `PUT /api/v1/views/{id}` `{ name, sections }` → 200 `NamedView` | 400 `invalid_view` | 404 `{ error: "unknown_view" }`
  - `DELETE /api/v1/views/{id}` → 204 | 404 `unknown_view` | 409 `{ error: "last_view" }`
  - SSE `event: views` `{ views }` à la connexion et après chaque changement. Dep `EventHub` : `views?: (lang) => unknown`.
  - Schémas OpenAPI `ViewItem`, `ViewSection`, `NamedView`, `ViewList`, `ViewInput` ; tag « View » ; description `/events` FR + EN mise à jour.

- [ ] **Step 1: Tests** (avec `validateResponse` sur chaque code) :
  - GET → `{ views: [main] }` FR puis EN (nom selon la langue).
  - POST `{ name: "Vol" }` → 201, `sections: []` ; 10e création → 409 `too_many_views`.
  - PUT A puis PUT B (deux vues) → GET contient les deux modifications.
  - PUT avec `v_self_destruct` → 400, vue inchangée ; PUT id inconnu → 404.
  - DELETE → 204 puis GET sans la vue ; DELETE de la dernière → 409 `last_view` ; DELETE inconnu → 404.
  - SSE : `views` à la connexion, puis après POST.
- [ ] **Step 2:** `npx vitest run tests/web/view-api.test.ts tests/web/contract.test.ts` → échec.
- [ ] **Step 3:** Implémenter routes, câblage `app.ts` (`viewsRoutes({ views })`, `events.refresh()` sur `onChange`), `events.ts`, contrat.
- [ ] **Step 4:** `npx vitest run tests/web` → vert.

### Task 3: Page — onglets de vues, ＋, nom, suppression, `?view=`

**Files:**
- Modify: `src/web/static/view.js`, `src/web/static/app.js`, `src/web/static/index.html`, `src/web/static/i18n.js`, `src/web/static/style.css`

**Interfaces:**
- Consumes : SSE `views`, routes de Task 2.
- Produces : `createView(ctx)` → `{ setViews(list), show(id), setState, setActions, setVisible, applyTexts }` ; `ctx.onViewsChanged(list)` appelé pour que `app.js` reconstruise les onglets ; `ctx.onSelect(id)` pour basculer d'onglet.

- [ ] **Step 1:** `app.js` : onglets fixes `grid|character|ship` + un bouton par vue (`tab-view-<id>`, texte = nom) + bouton `＋` (masqué à 10 vues) ; onglet retenu = `"view:<id>"` dans `TAB_KEY` ; ancienne valeur `"myview"` lue comme `view:main`.
- [ ] **Step 2:** Démarrage : `params.get("view")` prioritaire, puis `history.replaceState` sans le paramètre ; id inconnu → première vue (y compris quand `views` arrive après).
- [ ] **Step 3:** `＋` : POST `{ name: "Vue N" / "View N" }` (N = plus petit entier ≥ 2 non pris par un nom existant), ouvre la vue, déverrouille, met le focus dans le champ nom. 409 → message `tooManyViews`.
- [ ] **Step 4:** `view.js` : en édition, en tête du panneau, champ nom (≤ 24, PUT regroupé avec les sections) et « Supprimer la vue » (confirm `confirmDeleteView` avec le nom ; masqué s'il reste une vue) → DELETE → première vue. PUT des sections vers `/api/v1/views/{id}` ; 404 → bascule première vue, sans réessayer.
- [ ] **Step 5:** Vue affichée supprimée ailleurs (absente du `views` reçu) → première vue ; garde « pas de remplacement pendant l'édition / sauvegarde en attente » limitée à la vue affichée.
- [ ] **Step 6:** < 600 px : barre d'onglets remplacée par un `<select>` (tous les onglets + « ＋ Nouvelle vue »).
- [ ] **Step 7:** i18n FR + EN : `viewName`, `newViewName` (« Vue {0} » / « View {0} »), `addView`, `deleteView`, `confirmDeleteView`, `tooManyViews`, `defaultViewName` ; retirer `tabMyView` s'il n'est plus utilisé.
- [ ] **Step 8:** Vérifier sur le serveur de test (APPDATA temporaire, port 8744) dans le navigateur intégré : créer 2 vues, renommer, supprimer, `?view=<id>`, `?view=inconnu`, deux onglets du navigateur modifiant deux vues différentes, largeur 375 et 820, FR + EN.

### Task 4: Doc et vérifications finales

**Files:**
- Modify: `README.md`, `README.fr.md`, `docs/superpowers/specs/2026-11-21-ma-vue-design.md` (renvoi vers la conception des vues multiples dans « Non-objectifs »)

- [ ] README FR + EN : « Ma vue » devient « vos vues » : ＋ pour en ajouter, une par écran, lien `?view=`.
- [ ] `npm test`, `npm run build`, `npm run build:web`, `npx streamdeck validate com.sokren.sc-telemetry.sdPlugin` → verts ; `npm run build:exe` puis essai rapide de l'exe (port 8744).
- [ ] Pas de commit : Remi teste « Ma vue » + vues multiples ensemble.
