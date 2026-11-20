# Morse Code — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une action Stream Deck « Morse Code » qui fait clignoter la torche en morse (texte, durée d'un point, répétitions réglables).

**Architecture:** `src/morse/` est pur et testable : encodage du texte en instants de bascule, puis un lecteur qui exécute les bascules sur une horloge absolue, arrêtable, avec remise en état. `src/actions/morse-action.ts` relie au SDK ; un seul lecteur partagé par toutes les touches.

**Tech Stack:** identique à Actor Action (TypeScript, `@elgato/streamdeck` 3, vitest, sdpi-components v4).

**Spec:** `docs/superpowers/specs/2026-11-20-morse-code-design.md`

## Global Constraints

- UUID action : `com.sokren.sc-telemetry.morse-code` ; nom « Morse Code » ; Keypad seulement.
- Action du jeu : `toggle_flashlight`, délai 2000 ms par bascule (`TRIGGER_TIMEOUT_MS`).
- Réglages : `text` défaut `"SOS"` ; `unitMs` défaut 400, borné 100–2000 ; `repeat` défaut 1, borné 1–10.
- Rythme : point 1, trait 3, intra-lettre 1, entre lettres 3, entre mots 7, entre répétitions 7 unités.
- Commits en français + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push.

## Review Focus

1. Arrêt pendant que la torche est allumée → une bascule de remise en état, pas deux. → Task 1.
2. Bascule en échec au milieu (jeu fermé) → arrêt, ⚠, pas de bascules suivantes. → Task 1.
3. Deux touches Morse : la seconde arrête la première au lieu d'en lancer une autre. → Task 2.
4. Texte vide ou sans caractère émettable (« ??? ») → ⚠ sans appel au jeu. → Task 2.
5. Réglages hors bornes ou non numériques (saisis à la main) → valeurs par défaut/bornées. → Task 2.

---

### Task 1: Encodage et lecteur

**Files:** Create `src/morse/encode.ts`, `src/morse/player.ts` ; Test `tests/morse/encode.test.ts`, `tests/morse/player.test.ts`

**Interfaces:**
- `normalizeText(text: string): string` — majuscules, accents retirés, caractères hors A–Z/0–9/espace retirés, espaces multiples réduits, bords rognés.
- `toToggleTimes(text: string, unitMs: number, repeat: number): number[]` — instants (ms depuis le début) de chaque bascule ; nombre pair (allumer, éteindre…) ; `[]` si rien à émettre.
- `type PlayResult = "done" | "stopped" | "failed"`.
- `class MorsePlayer { constructor(toggle: () => Promise<boolean>, wait: (ms: number, signal: AbortSignal) => Promise<void>, now?: () => number); readonly playing: boolean; play(times: number[]): Promise<PlayResult>; stop(): void }` — `wait` résout tout de suite si le signal est annulé ; remise en état : si un nombre impair de bascules a réussi, une bascule de plus.

- [ ] Tests encode : `"SOS"`, unité 100 → `[0,100,200,300,400,500, 800,1100,1200,1500,1600,1900, 2200,2300,2400,2500,2600,2700]` ; `"E E"` → `[0,100, 800,900]` ; répétition 2 de `"E"` → `[0,100, 800,900]` ; `"été"` → normalisé `"ETE"` ; `"?!"` → `[]` ; `normalizeText("  a  b ")` → `"A B"`.
- [ ] Tests lecteur (horloge et attente simulées) : bascule à chaque instant prévu ; `done` ; `stop()` pendant l'allumage → `stopped` et une seule bascule de remise ; `stop()` pendant l'extinction → aucune remise ; bascule `false` → `failed`, plus de bascule prévue, remise si allumée ; `playing` vrai pendant, faux après.
- [ ] RED (`npm test`), implémentation, GREEN, commit `feat: encodage et lecteur morse`.

### Task 2: Action Morse Code

**Files:** Create `src/actions/morse-action.ts`, `com.sokren.sc-telemetry.sdPlugin/ui/morse-code.html`, `…/imgs/actions/morse-code/{icon,key}.svg` ; Modify `src/plugin.ts`, `…/manifest.json`, `…/fr.json`, `…/en.json`, `README.md` ; Test `tests/actions/morse-action.test.ts`

**Interfaces:**
- `type MorseSettings = { text?: string; unitMs?: number; repeat?: number }` ; `readSettings(s: MorseSettings): { text: string; unitMs: number; repeat: number }`.
- `class MorseAction extends SingletonAction<MorseSettings>` ; `constructor(deps: { player: MorsePlayer; log: (msg: string) => void })`. `plugin.ts` construit le lecteur avec `toggle = async () => (await game.trigger("toggle_flashlight", TRIGGER_TIMEOUT_MS)).ok`.
- Titre : texte normalisé ; pendant l'émission `"● " + texte`.

- [ ] Tests : appui → émet, titre « ● SOS » puis « SOS », ✔ ; appui pendant émission (même ou autre touche) → arrêt, pas de 2e émission ; texte `"???"` → ⚠ sans bascule ; `failed` → ⚠ + journal ; `readSettings` (défauts, bornes, valeurs non numériques ou chaînes).
- [ ] RED, implémentation, GREEN.
- [ ] Panneau : `sdpi-textfield setting="text"`, `sdpi-range setting="unitMs" min=100 max=2000 step=50 default=400 showlabels`, `sdpi-range setting="repeat" min=1 max=10 default=1 showlabels`, + note : torche éteinte au départ ; A–Z, 0–9, espaces, accents retirés.
- [ ] `npm run build`, `npx streamdeck validate` (seul l'avertissement de catégorie connu), commit `feat: action Morse Code`.
