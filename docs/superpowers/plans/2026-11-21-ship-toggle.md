# Ship Toggle et Ship Action — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une action « Ship Toggle » (fonction vaisseau avec état, mode bascule/on/off et style A/B/C par touche) et une action « Ship Action » (commandes vaisseau sans état, liste groupée).

**Architecture:** `src/ship/` est pur : table des 17 fonctions, lecture de l'état dans la section `vehicle` (+ garde « assis » sur `actor`), décision d'appui, mise en forme FR/EN et dessin SVG des trois styles. `src/actions/ship-toggle-action.ts` s'abonne au `TelemetryHub` existant comme Actor Display ; la limitation des envois (≤ 1 / 250 ms, sans doublon) est extraite d'Actor Display dans un module partagé. Ship Action est une `CategoryAction` de plus.

**Tech Stack:** identique (TypeScript strict, `@elgato/streamdeck` 3.0.x, vitest, sdpi-components v4).

**Spec:** `docs/superpowers/specs/2026-11-21-ship-toggle-design.md`

## Global Constraints

- UUID : `com.sokren.sc-telemetry.ship-toggle` (« Ship Toggle »), `com.sokren.sc-telemetry.ship-action` (« Ship Action ») ; Keypad seulement.
- Réglages Ship Toggle : `{ function?: ShipFunctionId; mode?: "toggle" | "on" | "off"; style?: "text" | "led" | "fill" }` ; défauts `gear`, `toggle`, `text` ; valeur inconnue → défaut.
- Table des fonctions, commandes et mots d'état : **exactement** celle de la spec (17 lignes, même ordre).
- `DANGEROUS_ACTIONS` = liste actuelle + `v_toggle_all_doorlocks`, `v_toggle_all_portlocks`, partagée par toutes les actions ; aucune n'est jamais envoyée ni proposée.
- Couleurs : on `#1D9E75` (fond C `#0F6E56`), en mouvement `#EF9F27` (fond C `#854F0B`), off `#888780`, indisponible / inconnu `#5F5E5A` ; fond touche `#111418`.
- Rafraîchissement ≤ 1 / 250 ms par touche, seulement si l'image change. Titre masqué (`ShowTitle: false`).
- **Tout texte visible en français et en anglais** (libellés, mots d'état, panneaux, manifeste, README FR/EN).
- Commits en français + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push.

## Review Focus

1. **Profil importé / réglage modifié** qui ferait envoyer une commande dangereuse (ex. `doors_closed` en mode off) : jamais envoyée. → Task 2.
2. **Sortie du vaisseau** (perso à pied, `vehicle` encore présente quelques frames) : « — ». → Task 1.
3. **Train en mouvement** et nouvel appui en mode Bascule : commande inverse du mouvement en cours. → Task 2.
4. **Vaisseau sans la fonction** (`transformation` absent, portes absentes sur le Titan) : « — » et ⚠ à l'appui, rien envoyé. → Task 1 + Task 2.
5. **Changement de style ou de fonction dans le panneau** : image redessinée tout de suite. → Task 4.

---

### Task 1: Table des fonctions et lecture de l'état

**Files:** Create `src/ship/functions.ts`, `src/ship/state.ts` ; Modify `src/actions/category-action.ts` → déplacer `DANGEROUS_ACTIONS` dans `src/game/dangerous.ts` (réexporté par category-action pour compatibilité) et ajouter les 2 noms ; Test `tests/ship/state.test.ts`

**Interfaces:**
- `type ShipFunctionId = "gear" | "lights" | "vtol" | "transform" | "decoupled" | "gsafe" | "proximity" | "esp" | "advanced_hud" | "night_vision" | "master_nav" | "power_engines" | "power_weapons" | "power_shields" | "power_main" | "doors_closed" | "doors_locked"`.
- `type ShipFunction = { id: ShipFunctionId; on?: string; off?: string; toggle?: string; onlyOn: boolean }` ; `const SHIP_FUNCTIONS: readonly ShipFunction[]` (ordre de la spec) ; `shipFunction(id: unknown): ShipFunction` (défaut `gear`).
- `type ShipState = "on" | "off" | "moving-on" | "moving-off" | "unavailable" | "unknown"`.
- `readShipState(id: ShipFunctionId, vehicle: Record<string, unknown> | undefined, actor: Record<string, unknown> | undefined): ShipState` — `vehicle` = section `vehicle` du hub (`VehicleFrame`, état sous `.state`).

- [ ] Tests (frame observée du Titan, voir spec) : gear on ; vtol on ; transform unavailable ; lights off (absent) ; decoupled off (couplé) ; gsafe on ; proximity off (`{enabled}`) ; esp on ; night_vision off ; master_nav off (SCM) ; advanced_hud off (SCM, `_scm` absent) ; power_* on ; doors_* unavailable ; `vehicle` undefined → unknown ; `actor` frais avec `locomotion` ON_FOOT → unknown même si `vehicle` présent ; `actor` absent → on se fie à `vehicle` ; gear DEPLOYING → moving-on, RETRACTING → moving-off, valeur inconnue → unknown ; `ifcs_cruise_mode {}` style → unavailable ; `master_mode {}` → master_nav et advanced_hud unknown ; NAV + `advanced_hud_enabled_nav: true` → on ; doors CLOSED/LOCKED → on, OPENED/UNLOCKED → off ; chaque commande de `SHIP_FUNCTIONS` existe dans `schema/actions.json` et n'est pas dans `DANGEROUS_ACTIONS` ; `DANGEROUS_ACTIONS` contient les 11 noms.
- [ ] RED, implémentation, GREEN (suite complète verte, y compris Actor Action), commit `feat: fonctions vaisseau et lecture de leur état`.

### Task 2: Décision d'appui

**Files:** Create `src/ship/press.ts` ; Test `tests/ship/press.test.ts`

**Interfaces:**
- `type ShipMode = "toggle" | "on" | "off"`.
- `type PressDecision = { kind: "send"; action: string } | { kind: "noop" } | { kind: "refuse"; reason: string }`.
- `decidePress(fn: ShipFunction, state: ShipState, mode: ShipMode): PressDecision` — règles 1 à 5 de la spec ; `onlyOn` force le mode `on` ; tout nom de `DANGEROUS_ACTIONS` → `refuse`.

- [ ] Tests : gear toggle on → send retract ; off → deploy ; moving-on → retract ; moving-off → deploy ; mode on + on → noop ; mode on + off → deploy ; mode off + off → noop ; unknown + toggle → `v_toggle_landing_system` ; unknown + on → deploy ; unavailable → refuse ; esp toggle on → `v_ifcs_toggle_esp` ; esp mode on + on → noop ; esp mode on + unknown → refuse ; doors_closed toggle + on → noop, + off → `v_close_all_doors`, mode off → traité comme on ; power_main unknown + toggle → `v_power_set_on` ; table modifiée de test avec `off: "v_power_set_off"` → refuse (garde-fou indépendant) ; aucune combinaison (17 fonctions × 6 états × 3 modes) ne produit un `send` d'une action dangereuse.
- [ ] RED, implémentation, GREEN, commit `feat: décision d'appui des interrupteurs vaisseau`.

### Task 3: Libellés et dessin des trois styles

**Files:** Create `src/ship/labels.fr.json`, `src/ship/labels.en.json`, `src/ship/render.ts` ; Test `tests/ship/render.test.ts`

**Interfaces:**
- Libellés : `{ "functions": { "<id>": { "label": "Train", "on": "SORTI", "off": "RENTRÉ" } … }, "modes": {…}, "styles": {…} }` (mots de la spec ; anglais : DOWN/UP…).
- `type ShipStyle = "text" | "led" | "fill"` ; `type Tone = "on" | "off" | "moving" | "none"`.
- `type ShipView = { id: ShipFunctionId; label: string; word: string; tone: Tone }` ; `toShipView(id, state, lang: Lang): ShipView` — moving → `"…"`, unavailable/unknown → `"—"`, tone `none`.
- `renderShipKey(view: ShipView, style: ShipStyle): string` (data URI SVG 144×144, une icône par fonction, texte échappé).

- [ ] Tests : toShipView fr/en (gear on → SORTI/DOWN, master_nav off → SCM, decoupled off → COUPLÉ/COUPLED, moving → …, unknown → —) ; chaque fonction a libellé + mots on/off en fr et en ; libellé ≤ 12 caractères ; style text contient le mot et sa couleur ; led contient un cercle de la couleur du ton ; fill contient le fond `#0F6E56` si on, `#854F0B` si moving, `#111418` sinon ; tone none → aucune couleur on/moving ; même vue + style → même chaîne ; échappement.
- [ ] RED, implémentation, GREEN, commit `feat: libellés FR/EN et dessin des interrupteurs vaisseau`.

### Task 4: Action Ship Toggle

**Files:** Create `src/actions/throttled-renderer.ts`, `src/actions/ship-toggle-action.ts` (logique), `src/actions/ship-toggle-registered.ts` (sous-classe `@action`), `com.sokren.sc-telemetry.sdPlugin/ui/ship-toggle.html`, `…/imgs/actions/ship-toggle/{icon,key}.svg` ; Modify `src/actions/display-action.ts` (utilise le module partagé, comportement inchangé), `src/plugin.ts`, manifeste, `fr.json`, `en.json` ; Test `tests/actions/throttled-renderer.test.ts`, `tests/actions/ship-toggle-action.test.ts`

**Interfaces:**
- `class ThrottledRenderer { constructor(opts?: { now?: () => number; schedule?: (fn: () => void, ms: number) => void; minIntervalMs?: number }); request(id: string, compute: () => { payload: string; send: () => Promise<void> } | undefined, force?: boolean): Promise<void>; forget(id: string): void }` — sans doublon, ≤ 1 / `minIntervalMs`, envoi différé du dernier état, rien après `forget`.
- `type ShipToggleSettings = { function?: ShipFunctionId; mode?: ShipMode; style?: ShipStyle }`.
- `class ShipToggleAction extends SingletonAction<ShipToggleSettings>` ; `constructor(deps: { hub: Pick<TelemetryHub, "subscribe" | "section">; game: Pick<GameApi, "trigger">; lang: () => Lang; sendToPropertyInspector; log; renderer?: ThrottledRenderer })`.
- Comme Actor Display : un abonnement par touche visible, rendu `setImage(renderShipKey(toShipView(...), style))` ; `onDidReceiveSettings` → rendu forcé.
- `onKeyDown` : `decidePress` → `send` : `game.trigger(action, 2000)` puis ✔/⚠ (+ journal si échec) ; `noop` → ✔ ; `refuse` → ⚠ + journal.
- `onSendToPlugin({ event: "getFunctions" })` → `{ event, items: [{ label, value }] }` (17, langue du logiciel).
- Panneau : 3 `sdpi-select` (Fonction / Function par datasource ; Mode et Style avec options bilingues statiques) + note bilingue sur les fonctions « On seulement ».

- [ ] Tests ThrottledRenderer (repris des tests de rendu d'Actor Display) ; tests Actor Display inchangés et verts.
- [ ] Tests Ship Toggle : apparition → abonné + image ; frame vehicle → nouvelle image ; style changé → image redessinée tout de suite ; appui gear toggle (état on) → `trigger("v_retract_landing_system", 2000)` + ✔ ; appui état déjà atteint → aucun trigger + ✔ ; refus → ⚠ + journal, aucun trigger ; échec du jeu → ⚠ + journal ; disparition → désabonné ; getFunctions → 17 items FR ; réglages inconnus → défauts.
- [ ] RED, implémentation, GREEN ; manifeste, panneau, icône, `plugin.ts` (même `hub` qu'Actor Display) ; build + validate ; commit `feat: action Ship Toggle`.

### Task 5: Action Ship Action

**Files:** Create `src/actions/ship-action.ts` ; Modify `src/catalog/dropdown.ts` (`SHIP_GROUPS`, exclusion des actions dangereuses), `src/catalog/labels.fr.json`, `src/catalog/labels.en.json` (groupes + actions des 9 catégories), `src/plugin.ts`, manifeste, `fr.json`, `en.json`, `ui/` (réutilise `actor-action.html`), `README.md`, `README.fr.md` ; Test `tests/catalog/dropdown.test.ts`, `tests/catalog/labels.test.ts`

**Interfaces:**
- `const SHIP_GROUPS: ActionGroup[]` (ordre de la spec) ; `buildDropdown` n'inclut jamais un nom de `DANGEROUS_ACTIONS` (même enregistré : il apparaît alors « (indisponible) »).
- `@action({ UUID: "com.sokren.sc-telemetry.ship-action" }) class ShipAction extends CategoryAction` (groupes `SHIP_GROUPS`).

- [ ] Tests : SHIP_GROUPS donne 9 groupes dans l'ordre, libellés fr/en ; aucune action dangereuse dans la liste ; toute action non dangereuse des 9 catégories de `schema/actions.json` a un libellé fr et en ; Actor Action inchangé.
- [ ] RED, implémentation, GREEN ; manifeste, `plugin.ts`, README FR/EN (lignes Ship Toggle et Ship Action) ; build + validate ; commit `feat: action Ship Action`.
