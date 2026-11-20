# Actor Action — Plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un plugin Stream Deck avec une action « Actor Action » : liste déroulante groupée (Personnage / Émotes) des actions du perso, déclenchées dans Star Citizen via l'API gRPC locale.

**Architecture:** Trois couches. `src/game/` parle au jeu (schéma chargé depuis `sc_extrait.desc` avec protobufjs, canal `@grpc/grpc-js` unique). `src/catalog/` est de la logique pure (libellés, groupes, repli sur l'instantané). `src/actions/` relie au SDK Elgato : une classe générique « action = liste de catégories », dont `ActorAction` est une instance.

**Tech Stack:** TypeScript strict, `@elgato/streamdeck` 3.0.x, `@elgato/cli` 1.10.x, rollup (gabarit officiel), `@grpc/grpc-js` 1.14.x, `protobufjs` 8.x (+ `protobufjs/ext/descriptor`), vitest, `sdpi-components` v4 (CDN) pour le panneau de réglage.

**Spec:** `docs/superpowers/specs/2026-11-20-actor-action-design.md`

## Global Constraints

- Node.js 24 ; manifeste : `"Nodejs": { "Version": "24" }`, `"Software": { "MinimumVersion": "7.1" }`, `"SDKVersion": 3`.
- UUID plugin : `com.sokren.sc-telemetry` ; dossier `com.sokren.sc-telemetry.sdPlugin/` à la racine du dépôt ; action : `com.sokren.sc-telemetry.actor-action`.
- Nom du plugin « SC Telemetry Deck », catégorie « Star Citizen », action « Actor Action ».
- Jeu : `127.0.0.1:2942`, `grpc.credentials.createInsecure()`, service `sc.game.telemetry.v1.GameTelemetryService`.
- Délais : `TriggerGameAction` 2000 ms ; `ListTriggerableActions` 1500 ms.
- Catégories d'Actor Action, dans cet ordre : `player` (« Personnage » / « Character »), `player_emotes` (« Émotes » / « Emotes »).
- `schema/` est la seule source : `sc_extrait.desc` et `actions.json` sont copiés dans `com.sokren.sc-telemetry.sdPlugin/data/` à la construction (copie ignorée par git).
- Aucun code généré depuis le schéma ; aucune liste d'actions codée en dur comme source de vérité.
- Libellés utilisateur en français, anglais pour toute autre langue du logiciel.
- Commits : messages en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pas de push.

## Review Focus

1. **Jeu fermé ou perso pas spawné** : la liste se remplit depuis l'instantané en ≤ 1,5 s, et un appui affiche ⚠ en ≤ 2 s, sans bloquer d'autres touches. → Task 1 (`listActions`/`trigger` vers un port fermé), Task 2 (repli de `ActionSource`).
2. **Action enregistrée qui disparaît après un patch** : elle reste sélectionnée, marquée « (indisponible) ». → Task 2.
3. **Nouvelle action inconnue des libellés** : libellé tiré du nom (`emote_new_thing` → « New thing »). → Task 2.
4. **Statut inconnu renvoyé par le jeu** (enum ouvert, valeur numérique) : ⚠, pas de plantage. → Task 1.
5. **Actions d'autres catégories dans la liste vivante** (vaisseau, dangereuses) : jamais proposées par Actor Action. → Task 2.

---

### Task 1: Projet Node et client du jeu

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/game/types.ts`, `src/game/schema.ts`, `src/game/client.ts`
- Test: `tests/game/client.test.ts`, `tests/game/fake-server.ts`
- Modify: `.gitignore` (ajouter `*.sdPlugin/data/`)

**Interfaces:**
- Produces (`src/game/types.ts`):
  - `type GameAction = { name: string; category: string; holdable: boolean }`
  - `type TriggerResult = { ok: true } | { ok: false; reason: string; message?: string }` — `message` = texte renvoyé par le jeu s'il y en a un ; `reason` = nom du statut du jeu (`"TRIGGER_GAME_ACTION_STATUS_RATE_LIMITED"`), `"STATUS_<n>"` pour une valeur inconnue, ou le nom du code gRPC (`"UNAVAILABLE"`, `"DEADLINE_EXCEEDED"`).
  - `interface GameApi { listActions(timeoutMs: number): Promise<GameAction[]>; trigger(name: string, timeoutMs: number): Promise<TriggerResult>; close(): void }`
- Produces (`src/game/schema.ts`): `loadSchema(descPath: string): GameSchema` ; `GameSchema` expose `root: protobuf.Root` et `type(name: string): protobuf.Type` (nom court, préfixé `sc.game.telemetry.v1.`).
- Produces (`src/game/client.ts`): `class GameClient implements GameApi` ; `constructor(schema: GameSchema, address = "127.0.0.1:2942")`. `listActions` rejette (Error) si le jeu ne répond pas ; `trigger` ne rejette jamais.

- [ ] **Step 1: Mettre en place le projet**

`package.json` repris du gabarit officiel `@elgato/cli` 1.10.5 (`"type": "module"`, scripts `build: rollup -c`, `watch: rollup -c -w --watch.onEnd="streamdeck restart com.sokren.sc-telemetry"`, mêmes devDependencies) + `"test": "vitest run"`, devDependency `vitest`, dependencies `@elgato/streamdeck@3.0.6`, `@grpc/grpc-js@^1.14.7`, `protobufjs@^8.8.1`. `tsconfig.json` du gabarit (`@tsconfig/node20`, `module ES2022`, `moduleResolution Bundler`, `noImplicitOverride`) avec `"strict": true`, `"experimentalDecorators"` non activé (le SDK 3 utilise les décorateurs standard). `npm install`.

- [ ] **Step 2: Écrire le faux serveur et les tests**

`tests/game/fake-server.ts` : `startFakeGame(handlers): Promise<{ port: number; stop(): Promise<void> }>` — un `grpc.Server` sur `127.0.0.1:0`, construit depuis le même `schema/sc_extrait.desc`, qui sert `ListTriggerableActions` et `TriggerGameAction` avec les réponses fournies.

`tests/game/client.test.ts` :
```ts
test("listActions renvoie les actions du jeu", async () => {
  // faux jeu : [{ action_name: "emote_wave", category: "player_emotes", holdable: false }]
  expect(await client.listActions(1500)).toEqual([{ name: "emote_wave", category: "player_emotes", holdable: false }]);
});
test("trigger OK", async () => {               // status = 1
  expect(await client.trigger("emote_wave", 2000)).toEqual({ ok: true });
});
test("trigger refusé par le jeu", async () => { // status = 4, message = "trop vite"
  expect(await client.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_RATE_LIMITED", message: "trop vite" });
});
test("statut inconnu", async () => {           // status = 99
  expect(await client.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "STATUS_99" });
});
test("jeu absent : trigger échoue vite sans rejeter", async () => {
  const c = new GameClient(schema, "127.0.0.1:1");   // port fermé
  const t0 = Date.now();
  expect((await c.trigger("emote_wave", 2000)).ok).toBe(false);
  expect(Date.now() - t0).toBeLessThan(2500);
});
test("jeu absent : listActions rejette en ≤ délai", async () => {
  await expect(new GameClient(schema, "127.0.0.1:1").listActions(1500)).rejects.toThrow();
});
test("l'action envoyée est exactement celle demandée", async () => {
  // le faux jeu enregistre action_name reçu ; attendu "emote_wave", hold_ms absent
});
```

- [ ] **Step 3: Lancer les tests, constater l'échec**

Run: `npm test` — Expected: FAIL (`GameClient` introuvable).

- [ ] **Step 4: Implémenter `schema.ts` et `client.ts`**

Chargement : `descriptor.FileDescriptorSet.decode(fs.readFileSync(path))` puis `protobuf.Root.fromDescriptor(set)` (`import descriptor from "protobufjs/ext/descriptor/index.js"` — vérifié : garde les noms snake_case). Appels : `new grpc.Client(address, grpc.credentials.createInsecure())` + `makeUnaryRequest("/sc.game.telemetry.v1.GameTelemetryService/<Rpc>", …, { deadline: Date.now() + timeoutMs }, cb)`, décodage `Type.toObject(msg, { enums: String, defaults: true })`. Statut OK = `"TRIGGER_GAME_ACTION_STATUS_OK"` ; statut numérique → `STATUS_<n>` ; erreur gRPC → `grpc.status[err.code]`.

- [ ] **Step 5: Tests verts**

Run: `npm test` — Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

`git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/game tests/game` — `feat: client gRPC du jeu (liste et déclenchement d'actions)`

---

### Task 2: Catalogue — libellés, groupes, repli

**Files:**
- Create: `src/catalog/labels.ts`, `src/catalog/labels.fr.json`, `src/catalog/labels.en.json`
- Create: `src/catalog/dropdown.ts`, `src/catalog/source.ts`
- Test: `tests/catalog/labels.test.ts`, `tests/catalog/dropdown.test.ts`, `tests/catalog/source.test.ts`

**Interfaces:**
- Consumes: `GameAction`, `GameApi` (Task 1).
- Produces:
  - `type Lang = "fr" | "en"` ; `toLang(appLanguage: string): Lang` (`"fr…"` → `"fr"`, sinon `"en"`).
  - `labelFor(name: string, lang: Lang): string` ; `groupLabel(category: string, lang: Lang): string` ; `humanize(name: string): string`.
  - `type ActionGroup = { category: string }` ; `const ACTOR_GROUPS: ActionGroup[] = [{ category: "player" }, { category: "player_emotes" }]`.
  - `type DataSourceItem = { label: string; value: string; disabled?: boolean } | { label: string; children: DataSourceItem[] }` (format `sdpi-components`).
  - `buildDropdown(actions: GameAction[], groups: ActionGroup[], lang: Lang, selected?: string): DataSourceItem[]`.
  - `readSnapshot(path: string): GameAction[]` (format de `schema/actions.json` ; fichier absent ou illisible → `[]`).
  - `class ActionSource { constructor(game: GameApi, snapshot: () => GameAction[]); getActions(): Promise<{ actions: GameAction[]; live: boolean }>; invalidate(): void }`.

Fichiers de libellés : `{ "groups": { "player": "Personnage", … }, "actions": { "emote_wave": "Saluer de la main", "mobiglas": "mobiGlas", … } }` pour les 38 actions de `player` et `player_emotes` de `schema/actions.json` (formulation libre, une entrée par action).

- [ ] **Step 1: Écrire les tests**

```ts
// labels.test.ts
expect(labelFor("emote_wave", "fr")).toBe(/* entrée fr */);
expect(labelFor("emote_new_thing", "fr")).toBe("New thing");   // inconnue → humanize
expect(humanize("v_starmap")).toBe("Starmap");                   // préfixe v_ / emote_ retiré
expect(toLang("fr")).toBe("fr"); expect(toLang("de")).toBe("en");
test("chaque action player/player_emotes de l'instantané a un libellé fr et en", …);

// dropdown.test.ts
const actions = [ {name:"emote_wave",category:"player_emotes"}, {name:"mobiglas",category:"player"},
                  {name:"v_self_destruct",category:"spaceship_general"} ];
const items = buildDropdown(actions, ACTOR_GROUPS, "fr");
expect(items.map(g => g.label)).toEqual(["Personnage", "Émotes"]);         // ordre des groupes
expect(JSON.stringify(items)).not.toContain("v_self_destruct");            // autres catégories exclues
test("actions triées par libellé dans chaque groupe", …);
test("groupe vide omis", …);
test("action enregistrée absente → ajoutée dans son groupe d'origine si connu, sinon en tête, libellé suffixé « (indisponible) », value = nom", …);
test("action enregistrée présente → aucun ajout", …);

// source.test.ts (GameApi factice)
test("jeu OK → live: true, actions du jeu", …);
test("jeu KO → live: false, actions de l'instantané", …);
test("2e appel après succès → cache, listActions appelé une seule fois", …);
test("invalidate() → le jeu est réinterrogé", …);
test("instantané absent → [] sans exception", …);   // readSnapshot("introuvable.json")
```

- [ ] **Step 2: Lancer, constater l'échec** — `npm test`, FAIL.

- [ ] **Step 3: Implémenter** `labels.ts`, `dropdown.ts`, `source.ts` (JSON importés avec `with { type: "json" }`). Pour une action indisponible dont la catégorie est inconnue, elle va en tête de liste hors groupe.

- [ ] **Step 4: Tests verts** — `npm test`, PASS.

- [ ] **Step 5: Commit** — `feat: catalogue des actions du perso (libellés fr/en, groupes, repli)`

---

### Task 3: Plugin Stream Deck et action Actor Action

**Files:**
- Create: `rollup.config.mjs` (gabarit officiel, `sdPlugin = "com.sokren.sc-telemetry.sdPlugin"`, + un plugin rollup `copy-schema` qui copie `schema/sc_extrait.desc` et `schema/actions.json` dans `<sdPlugin>/data/` au `buildStart` et les surveille)
- Create: `com.sokren.sc-telemetry.sdPlugin/manifest.json`, `…/ui/actor-action.html`, `…/imgs/plugin/{category-icon,marketplace}.svg`, `…/imgs/actions/actor-action/{icon,key}.svg`, `…/fr.json`, `…/en.json`
- Create: `src/plugin.ts`, `src/actions/category-action.ts`, `src/actions/actor-action.ts`
- Test: `tests/actions/category-action.test.ts`
- Modify: `README.md` (section « Développement du plugin »)

**Interfaces:**
- Consumes: `GameClient`, `loadSchema` (Task 1) ; `ActionSource`, `buildDropdown`, `readSnapshot`, `labelFor`, `toLang`, `ACTOR_GROUPS` (Task 2).
- Produces:
  - `type ActionSettings = { action?: string }`.
  - `abstract class CategoryAction extends SingletonAction<ActionSettings>` ; `constructor(deps: { game: GameApi; source: ActionSource; groups: ActionGroup[]; lang: () => Lang; sendToPropertyInspector: (payload: JsonValue) => Promise<void>; log: (msg: string) => void })` — `plugin.ts` passe `streamDeck.ui.sendToPropertyInspector` et `streamDeck.logger.info` ; les tests passent des espions (aucun import du runtime `streamDeck` dans les tests). Gère `onWillAppear` / `onDidReceiveSettings` (titre = `labelFor(settings.action)`, ou titre vide si rien), `onKeyDown`, `onSendToPlugin`.
  - `@action({ UUID: "com.sokren.sc-telemetry.actor-action" }) class ActorAction extends CategoryAction` (groupes `ACTOR_GROUPS`).
  - Protocole panneau ↔ plugin : le panneau envoie `{ event: "getActions" }` ; le plugin répond par `streamDeck.ui.sendToPropertyInspector({ event: "getActions", items: DataSourceItem[] })`.

- [ ] **Step 1: Tests de la logique d'action** (SDK simulé : objets `ev.action` avec `showOk`, `showAlert`, `setTitle` espions)

```ts
test("appui sans action choisie → showAlert, aucun appel au jeu", …);
test("appui → trigger(settings.action, 2000) ; ok → showOk", …);
test("appui → trigger KO → showAlert ; reason UNAVAILABLE → source.invalidate()", …);
test("willAppear → setTitle(libellé de l'action)", …);
test("sendToPlugin getActions → sendToPropertyInspector avec la liste groupée et l'action enregistrée", …);
test("sendToPlugin autre event → ignoré", …);
```

- [ ] **Step 2: Lancer, constater l'échec** — `npm test`, FAIL.

- [ ] **Step 3: Implémenter** `category-action.ts`, `actor-action.ts`, `plugin.ts` (schéma depuis `data/sc_extrait.desc` relatif au dossier du plugin — `process.cwd()` est le dossier `.sdPlugin` ; langue `toLang(streamDeck.info.application.language)` ; une ligne de journal par échec : action + raison + message du jeu ; niveau de log `info`).

- [ ] **Step 4: Tests verts** — `npm test`, PASS.

- [ ] **Step 5: Manifeste, panneau, icônes**

Manifeste sur le modèle du gabarit (Keypad seulement, `PropertyInspectorPath: "ui/actor-action.html"`, `CodePath: "bin/plugin.js"`, SVG pour les icônes, `Nodejs.Debug` absent). `fr.json` / `en.json` traduisent nom et infobulle de l'action. Panneau :
```html
<sdpi-item label="Action">
  <sdpi-select setting="action" datasource="getActions" hot-reload loading="…"></sdpi-select>
</sdpi-item>
```

- [ ] **Step 6: Construire et valider**

Run: `npm run build` puis `npx streamdeck validate com.sokren.sc-telemetry.sdPlugin` — Expected: build sans erreur (avertissements rollup « circular dependency » de grpc-js/protobufjs acceptables), `data/` contient les deux fichiers, validation sans erreur.

- [ ] **Step 7: Essai réel** (Remi, jeu PTU lancé, perso spawné)

`npx streamdeck link com.sokren.sc-telemetry.sdPlugin` puis `npx streamdeck restart com.sokren.sc-telemetry`. Vérifier : la liste montre Personnage puis Émotes ; « Saluer » sur une touche → le perso salue, ✔ ; jeu fermé → la liste s'affiche quand même, appui → ⚠ en ≤ 2 s.

- [ ] **Step 8: README + commit** — section « Développement du plugin » (`npm install`, `npm run build`, `npm test`, `link`). Commit : `feat: action Actor Action (Stream Deck)`
