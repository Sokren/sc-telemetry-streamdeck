# Actor Display — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une action « Actor Display » qui affiche en continu une constante du perso (oxygène, santé, températures…) sur une touche (chiffre + jauge colorée) ou une molette de Stream Deck + (écran + rotation pour changer de donnée).

**Architecture:** `GameClient` gagne l'ouverture du flux `TelemetryStream`. `src/telemetry/hub.ts` (TelemetryHub) partage un seul flux entre abonnés, fusionne les sections avec horodatage, gère péremption et reconnexion. `src/display/` est pur : lecture d'une donnée dans la section `actor`, mise en forme FR/EN, couleur, image SVG de touche et contenu de la molette. `src/actions/display-action.ts` relie au SDK.

**Tech Stack:** TypeScript strict, `@elgato/streamdeck` 3.0.x (`setImage`, `setFeedback`, `setFeedbackLayout`, `onDialRotate`), `@grpc/grpc-js` (`makeServerStreamRequest`), protobufjs, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-actor-display-design.md`

## Global Constraints

- UUID : `com.sokren.sc-telemetry.actor-display` ; nom « Actor Display » ; `"Controllers": ["Keypad", "Encoder"]`.
- Section périmée après **3000 ms** ; reconnexion du flux après **1000, 2000, 4000, puis 5000 ms** (plafond), tant qu'il y a des abonnés ; flux fermé à zéro abonné.
- Rafraîchissement d'une touche/molette **≤ 1 toutes les 250 ms**, et seulement si le rendu change.
- Ordre et identifiants des données : `health, oxygen, hunger, thirst, body_temperature, external_temperature, heart_rate, gravity, pressure, radiation, intoxication, breathable, balance` ; défaut `oxygen`.
- Seuils : jauges % → vert ≥ 50, orange 25–50, rouge < 25 ; température corporelle → vert 35–38 °C, orange [34,35) ou (38,39], rouge < 34 ou > 39. Pourcentage borné 0–100.
- Couleurs : vert `#1D9E75`, orange `#EF9F27`, rouge `#E24B4A`, gris `#5F5E5A` ; fond touche `#111418`.
- Indisponible → texte « — », barre grise.
- **Tout texte visible en français et en anglais** (libellés, panneau, manifeste, description des gestes, README FR/EN).
- Commits en français + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push.

## Review Focus

1. **Jeu fermé puis lancé** : touches à « — » tant que rien n'arrive, puis valeurs dès les premières frames, sans redémarrer le plugin. → Task 2 (reconnexion).
2. **Jeu fermé pendant l'affichage** : les touches passent à « — » ≈ 3 s après la dernière frame, même si plus aucune frame n'arrive. → Task 2 (notification de péremption).
3. **Champ absent dans une section fraîche** (faim à 0 non transmise) : affiche 0 %, rouge — pas « — ». Sous-message jauge sans `max` : « — ». → Task 3.
4. **Plus aucune touche visible** (changement de page) : le flux est fermé ; revenir sur la page le rouvre. → Task 2 + Task 5.
5. **Rotation rapide de la molette** (ticks ±3, négatifs) : avance du bon nombre de crans, en boucle, réglage enregistré. → Task 5.

---

### Task 1: Flux de télémétrie dans le client du jeu

**Files:** Modify `src/game/types.ts`, `src/game/client.ts`, `src/game/create.ts`, `tests/game/fake-server.ts` ; Test `tests/game/stream.test.ts`

**Interfaces:**
- `type TelemetryFrame = Record<string, unknown>` (objet décodé, noms snake_case, `enums: String`, `longs: String`, sans valeurs par défaut — `defaults: false`, pour distinguer section absente).
- `GameApi.openStream(onFrame: (frame: TelemetryFrame) => void, onEnd: (err?: Error) => void): { cancel(): void }` — `onEnd` appelé une fois (fin normale, erreur, ou jeu injoignable), **pas** après `cancel()`.
- `SchemaUnavailable.openStream` → appelle `onEnd(new Error(...))` au tick suivant.
- `startFakeGame` accepte `frames?: object[]` (diffusées puis fin du flux) et `streamError?: boolean`.

- [ ] Tests : reçoit les frames diffusées (`{ actor: { vitals: { health: { current: 100, max: 100 } } } }`), section absente → clé absente ; `uec_balance` int64 → chaîne `"15001986"` ; fin du flux → `onEnd()` une fois ; port fermé → `onEnd(err)` ; `cancel()` → plus d'`onFrame` ni d'`onEnd`.
- [ ] RED, implémentation (`makeServerStreamRequest`, `call.cancel()`), GREEN, commit `feat: lecture du flux de télémétrie`.

### Task 2: TelemetryHub

**Files:** Create `src/telemetry/hub.ts` ; Test `tests/telemetry/hub.test.ts`

**Interfaces:**
- `class TelemetryHub { constructor(game: Pick<GameApi, "openStream">, opts?: { staleMs?: number; retryMs?: number[]; now?: () => number; timers?: { setTimeout, clearTimeout, setInterval, clearInterval } }); subscribe(listener: () => void): () => void; section(name: string): Record<string, unknown> | undefined }`
- `section()` renvoie la dernière valeur reçue si elle a moins de `staleMs`, sinon `undefined`.
- Le flux s'ouvre au premier `subscribe`, se ferme (`cancel`) quand le dernier se désabonne ; les listeners sont appelés à chaque frame et quand une section devient périmée (vérification toutes les 500 ms tant qu'il y a des abonnés).

- [ ] Tests (faux `openStream` + horloge et minuteurs simulés, `vi.useFakeTimers` accepté) : pas de flux sans abonné ; ouvert au 1er abonné, un seul flux pour 2 abonnés ; frame → `section("actor")` et listener appelé ; frame partielle `{ vehicle }` ne remplace pas `actor` ; `actor` périmée après 3000 ms → `undefined` et listener appelé sans nouvelle frame ; fin de flux → réouverture après 1000, puis 2000, 4000, 5000, 5000 ms ; une frame reçue remet l'attente à 1000 ms ; dernier désabonnement → `cancel()` et plus de réouverture.
- [ ] RED, implémentation, GREEN, commit `feat: TelemetryHub (flux partagé, péremption, reconnexion)`.

### Task 3: Lecture des données et couleurs

**Files:** Create `src/display/values.ts` ; Test `tests/display/values.test.ts`

**Interfaces:**
- `type DisplayValueId = "health" | … | "balance"` ; `const DISPLAY_VALUES: readonly DisplayValueId[]` (ordre des Global Constraints) ; `isDisplayValueId(x: unknown): x is DisplayValueId`.
- `type Level = "ok" | "warn" | "bad" | "none"`.
- `type Reading = { available: false } | { available: true; kind: "percent"; percent: number; level: Level } | { available: true; kind: "number"; value: number; bar?: number; level: Level } | { available: true; kind: "bool"; value: boolean } | { available: true; kind: "money"; value: string }` — `bar` 0–100 (température corporelle sur l'échelle 30–42 °C).
- `readValue(id: DisplayValueId, actor: Record<string, unknown> | undefined): Reading`.

- [ ] Tests : `actor` undefined → `{ available: false }` ; frame observée (voir spec) → health 100 % ok, oxygen 100 % ok, hunger 78 % ok, thirst 47 % warn, body 36,5 ok bar ≈ 54, external 21, heart 61 (arrondi plus tard), gravity 1.0003, breathable true, balance "15001986" ; `vitals` sans `hunger` → 0 % bad ; jauge `{ current: 5 }` sans max → `{ available: false }` ; `{ current: 120, max: 100 }` → 100 % ; `{ current: -1, max: 100 }` → 0 % ; seuils exacts : 50 → ok, 49.9 → warn, 25 → warn, 24.9 → bad ; body 34.9 → warn, 33.9 → bad, 39.1 → bad, 38.5 → warn ; `radiation`/`intoxication` absents → 0.
- [ ] RED, implémentation, GREEN, commit `feat: lecture des constantes du perso`.

### Task 4: Mise en forme et rendu

**Files:** Create `src/display/labels.fr.json`, `src/display/labels.en.json`, `src/display/format.ts`, `src/display/render.ts` ; Test `tests/display/format.test.ts`, `tests/display/render.test.ts`

**Interfaces:**
- Fichiers de libellés : `{ "values": { "<id>": { "short": "O₂", "long": "Oxygène" }, … }, "yes": "Oui", "no": "Non" }` pour les 13 ids.
- `type DisplayView = { short: string; long: string; text: string; unit: string; bar?: number; color: string }` — `color` hex selon `Level` (gris si indisponible ou `none`).
- `toView(id: DisplayValueId, reading: Reading, lang: Lang): DisplayView` — `Lang` vient de `src/catalog/labels.ts`. Formats : % entier ; body 1 décimale ; external, heart, intoxication entiers ; gravity, pressure, radiation 2 décimales ; unités `%`, `°C`, `bpm`, `g`, `""` ; bool Oui/Non · Yes/No ; balance compacte (`999`, `12,3 k`, `15,0 M`, `1,2 Md` / `12.3k`, `15.0M`, `1.2B`) avec unité `aUEC` ; virgule décimale en `fr`. Indisponible → `text: "—"`, `unit: ""`, `bar` 0 si la donnée a une jauge.
- `renderKeySvg(view: DisplayView): string` → `data:image/svg+xml;charset=utf8,…` (144×144, fond `#111418`, libellé court gris en haut, valeur blanche en grand, unité, barre en bas si `bar` défini). Texte échappé (XML).
- `toFeedback(view: DisplayView): { title: string; value: string; indicator?: { value: number; bar_fill_c: string } }` (clés de la mise en page molette).

- [ ] Tests : `toView` fr/en sur la frame observée (`"36,5"`/`"36.5"` °C, `"Oui"`/`"Yes"`, `"15,0 M"`/`"15.0M"`) ; indisponible → `"—"` ; tous les ids ont un libellé fr et en (court ≤ 6 caractères) ; `renderKeySvg` contient la valeur, l'unité, la couleur de barre, échappe `<&`, sans barre si `bar` absent ; `toFeedback` reprend libellé long, texte + unité, couleur.
- [ ] RED, implémentation, GREEN, commit `feat: mise en forme et rendu des constantes`.

### Task 5: Action Actor Display

**Files:** Create `src/actions/display-action.ts`, `src/actions/actor-display-action.ts`, `com.sokren.sc-telemetry.sdPlugin/ui/actor-display.html`, `…/layouts/actor-display.json`, `…/imgs/actions/actor-display/{icon,key}.svg` ; Modify `src/plugin.ts`, `…/manifest.json`, `…/fr.json`, `…/en.json`, `README.md`, `README.fr.md` ; Test `tests/actions/display-action.test.ts`

**Interfaces:**
- `type DisplaySettings = { value?: DisplayValueId }` (valeur inconnue → `oxygen`).
- `class DisplayAction extends SingletonAction<DisplaySettings>` ; `constructor(deps: { hub: Pick<TelemetryHub, "subscribe" | "section">; lang: () => Lang; sendToPropertyInspector: (p: JsonValue) => Promise<void>; now?: () => number; schedule?: (fn: () => void, ms: number) => void })`.
- Par action visible (`ev.action.id`) : `onWillAppear` → mémorise l'action et ses réglages, abonne au hub (un abonnement par action visible), rend immédiatement ; molette → `setFeedbackLayout("layouts/actor-display.json")` d'abord. `onWillDisappear` → désabonne et oublie. `onDidReceiveSettings` → met à jour et rend.
- Rendu : touche → `setImage(renderKeySvg(view))` ; molette → `setFeedback(toFeedback(view))` ; ignoré si identique au dernier envoi ; au plus un envoi par 250 ms par action (envoi différé du dernier état sinon).
- `onDialRotate` : nouvel id = `DISPLAY_VALUES[(i + ticks) mod 13]` (modulo positif), `setSettings`, rendu.
- `onSendToPlugin({ event: "getValues" })` → `{ event: "getValues", items: [{ label: long, value: id }…] }`.
- Manifeste : `Encoder: { "layout": "layouts/actor-display.json", "TriggerDescription": { "Rotate": "Change value" } }` ; `fr.json`/`en.json` : nom, infobulle et `Encoder.TriggerDescription.Rotate` (« Changer de donnée » / « Change value »).
- Mise en page molette : items `title` (texte), `value` (texte grand), `indicator` (`bar`, plage 0–100).
- Panneau : `<sdpi-select setting="value" datasource="getValues" hot-reload>` libellé « Donnée / Value ».

- [ ] Tests (hub, actions et minuterie simulés) : apparition touche → abonné + `setImage` ; apparition molette → `setFeedbackLayout` puis `setFeedback` ; frame du hub → nouveau rendu ; même rendu → pas de renvoi ; deux mises à jour en < 250 ms → un envoi immédiat + un différé (le dernier) ; disparition → désabonnement ; rotation +1 depuis `balance` → `health` ; −3 depuis `oxygen` → `breathable` ; `setSettings` appelé ; réglage inconnu → oxygène ; `getValues` → 13 items en français.
- [ ] RED, implémentation, GREEN.
- [ ] `plugin.ts` : un `TelemetryHub` partagé (`new TelemetryHub(game)`), action enregistrée ; manifeste, panneau, mise en page, icône (jauge stylisée), README FR/EN (ligne du tableau des actions, sans « prévu » pour l'oxygène/températures).
- [ ] `npm run build`, `npx streamdeck validate` (seul l'avertissement de catégorie connu), commit `feat: action Actor Display (touches et molettes)`.
