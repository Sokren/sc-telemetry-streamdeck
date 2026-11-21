# Ship Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contre-mesures (leurres, brouilleurs) sur une nouvelle action Stream Deck « Ship Display » (touche + molette) et comme instruments de l'appli web.

**Architecture:** Un module partagé lit la section `weapons` et garde le maximum vu par modèle de vaisseau ; l'action plugin le rend avec les utilitaires d'Actor Display ; l'appli web l'expose comme deux instruments.

**Tech Stack:** TypeScript, @elgato/streamdeck, vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-ship-display-design.md`

## Global Constraints

- Actions existantes (dont Actor Display) inchangées ; `npm test`, `npm run build`, `npm run build:web`, `npx streamdeck validate com.sokren.sc-telemetry.sdPlugin` verts.
- Textes FR + EN (manifeste `fr.json`/`en.json`, inspecteur, libellés, API « — FR : »).
- Niveaux : vert ≥ 50 %, orange 25–50 %, rouge < 25 % ; 0 = rouge ; 100 % = max vu par `class_name`, en mémoire, sans remise à zéro.
- Branche `feat/ship-display`, **aucun commit** sans l'accord de Remi.

## Review Focus

- Vaisseau sans brouilleurs (type absent) → « — » pour ce type, `countermeasures` n'affiche que l'autre (test Task 1).
- Section `weapons` périmée (jeu fermé) → « — » (test Task 1 et Task 2).
- Perso à pied avec `actor` présente → « — » ; `actor` absente → valeurs affichées (test Task 1).
- Retour dans le même modèle après un combat → pourcentage d'après le stock plein vu avant (test Task 1).
- Maximum à 0 et stock à 0 → 0 %, rouge, sans division par zéro (test Task 1).

---

### Task 1: Lecture des contre-mesures

**Files:** Create `src/display/countermeasures.ts` ; Test `tests/display/countermeasures.test.ts`

**Interfaces — Produces:**
- `type CmType = "decoy" | "noise"`
- `type CmReading = { available: false } | { available: true; amount: number; percent: number; level: Level }`
- `type ShipSections = { weapons?: Obj; vehicle?: Obj; actor?: Obj }`
- `class CountermeasureTracker { observe(s: ShipSections): void; read(type: CmType, s: ShipSections): CmReading }` (`read` appelle `observe`).

- [ ] Tests (valeurs de la capture : 48 / 5, puis 45 / 3) : plein → 100 % ok ; 45/48 → 94 % ; 3/5 → 60 % ok ; 1/5 → 20 % bad ; 0 → bad ; type absent → indisponible ; `weapons` absente → indisponible ; actor ON_FOOT → indisponible ; actor absente → disponible ; même `class_name` revu après 3/5 → 60 % (max gardé) ; autre `class_name` → nouveau max ; `vehicle` absente → dernier modèle connu.
- [ ] `npx vitest run tests/display/countermeasures.test.ts` → échec, implémenter, → vert.

### Task 2: Action « Ship Display »

**Files:** Create `src/display/ship-values.ts` (`SHIP_DISPLAY_VALUES = ["countermeasures","decoys","noise"]`, `shipView(id, s, tracker, lang): DisplayView`), `src/actions/ship-display-action.ts` (`@action({ UUID: "com.sokren.sc-telemetry.ship-display" })`, mêmes événements qu'`DisplayAction`, réglage `{ value }`, défaut `countermeasures`), `com.sokren.sc-telemetry.sdPlugin/ui/ship-display.html`, `imgs/actions/ship-display/{icon,key}.svg` ; Modify `src/plugin.ts`, `manifest.json`, `fr.json`, `en.json`, `src/display/labels.{fr,en}.json` ; Test `tests/display/ship-values.test.ts`, `tests/actions/ship-display-action.test.ts`.

- [ ] Tests `shipView` : « 45 / 3 », barre = plus bas pourcentage, couleur = son niveau ; un seul type → « 45 » ; aucun → « — » ; libellés FR / EN.
- [ ] Tests action (faux hub comme `display-action.test.ts`) : rendu à l'apparition, molette +1 / −1 en boucle sur les 3 valeurs, réglage inconnu → `countermeasures`, `getValues` → 3 libellés.
- [ ] Implémenter, enregistrer dans `plugin.ts`, manifeste (Keypad + Encoder, layout `layouts/actor-display.json`).

### Task 3: Instruments de l'appli web

**Files:** Modify `src/web/panels.ts` (`InstrumentId` += `decoys`, `noise` après `hull` ; `shipStatusOf(vehicle, actor, lang, cm?: { weapons?: Obj; tracker: CountermeasureTracker })`), `src/web/events.ts`, `src/web/routes/panels.ts`, `src/web/app.ts` (un `CountermeasureTracker` ; abonnement hub qui appelle `observe`), `src/web/labels.{fr,en}.json`, `src/web/openapi.json` (énumération) ; Test `tests/web/panels.test.ts`.

- [ ] Tests : instruments `decoys` / `noise` présents (texte = nombre, sans unité, `percent`, niveau) ; « — » sans section `weapons` ; ordre des instruments.
- [ ] Implémenter ; `npx vitest run tests/web` vert (contrat compris).

### Task 4: Doc et vérifications

- [ ] README FR + EN : action Ship Display, limite « maximum appris pendant qu'un affichage est visible ».
- [ ] `npm test`, `npm run build`, `npm run build:web`, `npx streamdeck validate …`, `npm run build:exe` ; relecture finale.
