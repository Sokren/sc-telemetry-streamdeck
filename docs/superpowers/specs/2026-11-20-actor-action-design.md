# Conception — Plugin Stream Deck : action « Actor Action »

Date : 2026-11-20 · Statut : à valider

## Intention

Remi veut des raccourcis Stream Deck pour son personnage dans Star Citizen : surtout les **émotes**
(saluer, danser, s'asseoir…), plus les quelques actions du perso (mobiGlas, torche, carte, visière).
On pose « Actor Action » sur une touche, on choisit l'action dans une liste déroulante groupée, et un
appui la déclenche dans le jeu via l'API de télémétrie locale.

C'est aussi la **première brique du plugin** : la connexion gRPC et le mécanisme « une action Stream
Deck = un filtre de catégories » doivent servir tels quels aux futures actions (vaisseau, interrupteurs
avec état, afficheurs).

## Objectifs

- Un plugin Stream Deck installable en développement (`streamdeck link`), avec une seule action :
  **Actor Action**.
- Panneau de réglage : une liste déroulante en deux groupes, **Personnage** (`player`, 4 actions) et
  **Émotes** (`player_emotes`, 34 actions), avec des libellés lisibles en français.
- Un appui déclenche l'action choisie (`TriggerGameAction`) ; la touche affiche ✔ (succès) ou ⚠ (échec).
- La liste se règle **même jeu fermé**.
- Messages et libellés en français, anglais prévu.

## Hors périmètre (pour cette étape)

- Lecture du flux `TelemetryStream`, état en mémoire, touches grisées quand le jeu est absent.
- Actions vaisseau et actions dangereuses (aucune dans `player` / `player_emotes`).
- Actions maintenues (`hold_ms`) : aucune action de ces catégories n'est `holdable`.
- Icônes dessinées par émote : une icône générique ; le libellé de l'action sert de titre.
- Publication sur le Marketplace Elgato.

## À éviter absolument

- Qu'une touche déclenche une autre action que celle affichée.
- Coder la liste des actions en dur comme source de vérité : le jeu fait foi, l'instantané n'est qu'un
  secours.
- Voler le focus au jeu, ou bloquer le Stream Deck si le jeu ne répond pas.
- Lire la mémoire du jeu ou modifier ses fichiers ; dépendre du pont Python.

## Contraintes

- SDK officiel Elgato : `@elgato/streamdeck` 3.x, CLI `@elgato/cli` (à installer). Node.js 24 (installé :
  24.14.0). Logiciel Stream Deck installé : 7.6.1 ; minimum déclaré : 7.1.
- API du jeu : `127.0.0.1:2942`, gRPC en clair, sans réflexion ; schéma = `schema/sc_extrait.desc`
  (5.0 PTU build 13238477), chargé à l'exécution, pas de code généré.
- `TriggerGameAction` renvoie un `status` : `OK`, `UNKNOWN_ACTION`, `MAP_INACTIVE`, `RATE_LIMITED`,
  `FAILED`, `HOLD_NOT_ALLOWED`, `FILTERED` (enum ouvert : tolérer d'autres valeurs).
- Le jeu ne répond qu'une fois le perso spawné.

## Approches envisagées

- **A — Action dédiée « Actor Action » (retenue).** Une action Stream Deck filtrée sur les catégories
  `player` + `player_emotes`, liste groupée. Le code dessous est générique (une action = une liste de
  catégories), pour ajouter « Ship Action » etc. sans refonte. Liste courte et lisible ; ajoute de la
  valeur tout de suite.
- **B — Une seule action « Déclencher » pour les 112 actions.** Plus générale, mais la liste est longue
  et mélange vaisseau et perso, et impose de traiter les actions dangereuses dès maintenant.
- **C — Une action Stream Deck par émote.** Écartée : 34 entrées dans la liste du logiciel, pas de
  liste déroulante, contraire à ce que Remi a décrit.

Remi a choisi **A**.

## Ce qui est décidé

### Comportement de la touche

- Réglage enregistré par touche : `{ "action": "emote_wave" }` (nom technique du jeu).
- Titre : le libellé lisible de l'action (« Saluer ») tant que l'utilisateur n'a pas mis son propre titre.
- Appui (`keyDown`) :
  - pas d'action choisie → ⚠ ;
  - appel `TriggerGameAction{ action_name }` avec un délai de 2 s ;
  - `status = OK` → ✔ ; tout autre statut, erreur gRPC ou délai dépassé → ⚠, et une ligne dans le journal
    du plugin (statut + message du jeu).
- Un appui ne doit jamais bloquer : appels asynchrones, un appui pendant qu'un appel est en cours est
  traité normalement (le jeu limite lui-même le débit : `RATE_LIMITED`).

### Liste déroulante

- Fournie par le plugin au panneau de réglage (source de données de `sdpi-components`).
- Source : `ListTriggerableActions` si le jeu répond (délai court, ≈ 1,5 s) ; sinon l'instantané
  `schema/actions.json` embarqué dans le plugin. Le résultat vivant est mis en cache tant que la
  connexion tient.
- Groupes : « Personnage » (`player`), « Émotes » (`player_emotes`), triés par libellé.
- Action inconnue des libellés (nouvelle émote après un patch) : affichée avec un libellé tiré du nom
  technique (`emote_new_thing` → « New thing »).
- Action enregistrée mais absente de la liste (retirée par un patch) : reste affichée et sélectionnée,
  marquée « (indisponible) », pour ne pas perdre le réglage en silence.

### Libellés

- Table de traduction `nom technique → libellé` en français et en anglais, séparée du code ; langue
  suivant celle du logiciel Stream Deck.

### Connexion au jeu

- Un module client partagé : un seul canal `@grpc/grpc-js` vers `127.0.0.1:2942` (identifiants
  « insecure »), schéma chargé depuis `sc_extrait.desc` avec `protobufjs` (descripteur binaire).
- Pas de flux de télémétrie dans cette étape ; le module doit pouvoir l'accueillir ensuite.

### Organisation

- Le plugin vit à la racine du dépôt : `package.json`, `src/`, dossier `*.sdPlugin/`.
- Identifiant du plugin : `com.sokren.sc-telemetry`, action `com.sokren.sc-telemetry.actor-action`
  *(choix de Claude, d'après le compte GitHub du dépôt)*.
- Nom affiché du plugin : « SC Telemetry Deck » ; catégorie dans la liste d'actions du logiciel :
  « Star Citizen » ; nom de l'action : « Actor Action » *(choix de Claude)*.
- Le journal du plugin est celui du SDK (dossier `logs/` du plugin), sans fichier supplémentaire.
- `schema/sc_extrait.desc` et `schema/actions.json` sont copiés dans le plugin à la construction (le
  dossier `schema/` reste la source unique).

## Laissé au développeur

- Icône générique de l'action et de la catégorie (SVG simple, provisoire).
- Formulation exacte des libellés français et anglais.
- Outillage de construction (gabarit `streamdeck create`) et tests : tests unitaires de la logique pure
  (filtrage, groupes, libellés, repli sur l'instantané, statuts) ; test manuel sur le jeu PTU lancé.
