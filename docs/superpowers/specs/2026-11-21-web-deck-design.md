# Conception — « SC Telemetry Deck Web » (boutons dans un navigateur)

Date : 2026-11-21 · Statut : à valider par Remi

## Intention

Proposer les mêmes boutons et afficheurs que le plugin Stream Deck **dans un navigateur**, pour :
- les joueurs **sans Stream Deck** (navigateur sur le PC de jeu, second écran) ;
- une **tablette ou un téléphone** posé à côté du joueur.

Remi a choisi : application **autonome** (fonctionne sans le logiciel Stream Deck), dans le **même
dépôt**, en partageant le code existant. Projet nettement plus gros qu'une action Stream Deck ;
livrable par étapes.

## Constat dans le code (2026-11-21)

Seuls `src/actions/*` et `src/plugin.ts` dépendent du SDK Stream Deck. Sont déjà indépendants et
réutilisables tels quels : `src/game/` (client gRPC, schéma, actions dangereuses), `src/telemetry/`
(flux partagé), `src/catalog/` (listes d'actions, libellés FR/EN), `src/display/` (constantes du
perso, rendu SVG), `src/ship/` (états, décision d'appui, rendu SVG), `src/morse/` (encodage,
lecteur), `src/actions/throttled-renderer.ts` (sans SDK). **Pas besoin de déplacer le code** : le
« cœur commun » existe déjà, l'appli web ajoute un second point d'entrée à côté de `src/plugin.ts`.

## Objectifs

1. **Serveur local** (Node, même dépôt, point d'entrée `src/web/server.ts`) : se connecte au jeu
   (même `GameClient` / `TelemetryHub` que le plugin), sert une page web et lui pousse l'état en direct.
2. **Page web** : une grille de tuiles cliquables qui reprend les 5 types du plugin :
   Actor Action (perso / émotes), Actor Display (constantes), Ship Toggle (fonction + mode + style),
   Ship Action (commandes vaisseau), Morse Code. Même rendu que les touches (mêmes images SVG).
3. **Accès tablette / téléphone** sur le réseau local, protégé par un **jeton** transmis par **QR code**.
4. **Grille modifiable** depuis la page (ajouter, retirer, réordonner, régler une tuile), partagée
   entre tous les appareils.
5. **Exécutable unique** `sc-telemetry-web.exe` (aucune installation de Node pour le joueur), joint
   aux releases à côté du `.streamDeckPlugin`.
6. Tout texte visible en **français et en anglais** (règle du projet).

## Hors périmètre

- Accès depuis Internet, HTTPS, comptes utilisateurs, plusieurs grilles par utilisateur.
- Application mobile native, publication sur un store.
- macOS / Linux (le jeu est sous Windows).
- Remplacer le plugin Stream Deck : les deux coexistent (chacun ouvre sa propre connexion au jeu).

## À éviter absolument

- **Envoyer une action dangereuse** depuis la page — mêmes garde-fous que le plugin
  (`DANGEROUS_ACTIONS`, `decidePress`), appliqués **côté serveur** (jamais confiance au navigateur).
- **Ouvrir les commandes du jeu à n'importe qui sur le réseau** : sans jeton valide, le serveur ne
  renvoie rien et ne déclenche rien.
- Afficher un état faux (mêmes règles « — » que le plugin).
- **Casser ou modifier le plugin Stream Deck** (exigence explicite de Remi). Concrètement :
  - aucun changement de comportement du plugin ; `src/actions/*`, `src/plugin.ts`, le dossier
    `com.sokren.sc-telemetry.sdPlugin/` et `rollup.config.mjs` (construction du plugin) restent
    intacts, sauf déplacement de code **sans changement de comportement** couvert par les tests ;
  - l'appli web a son **propre point d'entrée, sa propre construction et son propre dossier de
    sortie** ; le paquet `.streamDeckPlugin` ne contient rien de l'appli web ;
  - à chaque étape : **toute la suite de tests existante reste verte**, et le plugin est reconstruit
    et validé (`npm run build`, `streamdeck validate`) avant chaque commit ;
  - travail sur une branche séparée, fusionnée seulement après essai du plugin par Remi.

## Approches envisagées

- **A. Plugin Stream Deck qui sert aussi la page.** Écarté : la page ne marcherait que si le logiciel
  Stream Deck tourne, contraire à « pour ceux qui n'ont pas de Stream Deck ».
- **B. Appli autonome, même dépôt, code partagé (retenue).** Second point d'entrée qui réutilise les
  modules sans SDK ; un seul jeu de règles de sécurité, de libellés et de rendus.
- **C. Dépôt séparé.** Écarté : dupliquerait schéma, sécurité, traductions et rendus, qui finiraient
  par diverger.
- Pont Python existant (`tools/sc_bridge.py`) : écarté (sans les règles de sécurité, dépend de Python).

## Ce qui est décidé

### Organisation du code : le plugin n'est pas touché *(choix de Claude, suite à la consigne de Remi)*

Seules les fonctions **pures et partagées** sont réutilisées telles quelles : `decidePress`,
`DANGEROUS_ACTIONS`, `readShipState`, `readValue`, `toView`, `toShipView`, les rendus SVG,
`buildDropdown`, `toToggleTimes`, `MorsePlayer`, `ThrottledRenderer`, `TelemetryHub`, `GameClient`.
La « colle » des actions du plugin (appui → commande → ✔ / ⚠ → journal, gestion des abonnements,
arrêt du morse au second appui) vit dans des classes du SDK Stream Deck ; l'appli web a **ses
propres petits contrôleurs** sous `src/web/` qui appellent ces fonctions partagées. Cette colle est
courte et dupliquée volontairement : **aucun fichier du plugin n'est modifié**, et les règles de
sécurité restent uniques puisqu'elles sont dans les fonctions partagées.

### Rendu côté serveur, page « mince » *(choix de Claude)*

Le serveur calcule l'image SVG de chaque tuile avec **les mêmes fonctions que le plugin**
(`renderShipKey`, `renderKeySvg`…) et pousse les images qui changent ; la page affiche les images et
renvoie les appuis. Avantages : rendu identique au Stream Deck, aucune logique de jeu dans le
navigateur, règles de sécurité uniquement côté serveur.
Les trois types qui n'ont pas d'image dessinée dans le plugin (Actor Action, Ship Action, Morse
Code — ils utilisent le titre de la touche) reçoivent un **rendu de tuile propre à l'appli web**
(`src/web/`) : libellé de l'action (catalogue FR / EN), icône du type, couleur du groupe ; la tuile
Morse affiche « ● TEXTE » pendant l'émission (lecteur unique, état visible sur tous les appareils). Mêmes limites que le plugin : rafraîchissement
d'une tuile ≤ 4 / s, seulement si l'image change (`ThrottledRenderer`).

### Protocole *(choix de Claude)*

- HTTP sans dépendance lourde : **Server-Sent Events** (`GET /api/events`) pour pousser les images et
  les retours ✔ / ⚠, `POST /api/press` pour un appui, `GET/PUT /api/layout` pour la grille,
  `GET /api/catalog` pour les listes (fonctions, données, actions, groupes) dans la langue demandée.
- Chaque requête porte le jeton (`Authorization: Bearer …`, ou `?t=` pour l'URL du QR code, puis
  conservé par la page). Jeton absent ou faux → `401`, rien d'autre.
- La langue suit le navigateur (`fr…` → français, sinon anglais), avec un bouton FR / EN sur la page.

### Réseau et sécurité *(choix de Claude)*

- Port **8743** (8742 est pris par le pont Python), modifiable.
- **Par défaut : PC seulement** (`127.0.0.1`). L'accès réseau local (tablette / téléphone) s'active
  dans les réglages de l'appli. Il écoute alors sur les **adresses IPv4 privées** des cartes réseau
  du PC (10.x, 172.16–31.x, 192.168.x) et **refuse toute connexion venant d'une adresse non privée**.
  Le QR code utilise la première adresse privée trouvée ; s'il y en a plusieurs (Wi-Fi + câble, VPN,
  WSL), la page du PC propose de choisir *(choix de Claude)*.
- **Réglages de sécurité modifiables uniquement depuis le PC** *(choix de Claude)* : activer / couper
  l'accès réseau, changer de port, créer un nouveau jeton → accepté seulement si la requête vient de
  `127.0.0.1` **et** porte un jeton valide. Une tablette appairée peut utiliser et modifier la grille,
  jamais ces réglages. Changer le port ou l'accès réseau relance l'écoute ; la page du PC se reconnecte.
- Jeton aléatoire long, créé au premier lancement, stocké dans le fichier de réglages ; bouton
  « nouveau jeton » qui déconnecte les appareils déjà appairés.
- Au démarrage, l'appli ouvre la page dans le navigateur du PC (jeton inclus) ; la page affiche un
  **QR code** (adresse réseau + jeton) quand l'accès réseau est actif.
- Mêmes garde-fous que le plugin pour les appuis : `decidePress`, `DANGEROUS_ACTIONS`, refus des
  réglages inconnus.

### Grille

- Une seule grille, **enregistrée côté serveur** dans un fichier JSON (dossier utilisateur
  `%APPDATA%\SC Telemetry Deck\`), partagée par tous les appareils.
- Une tuile = un type (`actor-action`, `actor-display`, `ship-toggle`, `ship-action`, `morse`) et ses
  réglages, **identiques à ceux du plugin** (mêmes noms, mêmes valeurs par défaut) pour que la logique
  et les tests soient réutilisés.
- Grille par défaut au premier lancement *(choix de Claude)* : Train, Phares, Découplage, Mode NAV,
  Puissance moteurs, Oxygène, Santé, Température corporelle, Faire coucou, Morse SOS.
- **Mode édition** sur la page : ajouter une tuile, la régler (mêmes choix que les panneaux du plugin),
  la déplacer, la supprimer. Nombre de colonnes adapté à la largeur de l'écran.
- Appui : clic ou toucher ; ✔ / ⚠ brefs sur la tuile, comme `showOk` / `showAlert`.

### Fichier exécutable

- Construction par **Node SEA** (Single Executable Application, Node 24) : un seul `sc-telemetry-web.exe`
  contenant le serveur, la page, le schéma et l'instantané d'actions. Construit **sur le PC** par un
  script `npm` (comme le paquet du plugin), puis joint à la release avec `gh`.
- Si un `sc_extrait.desc` et / ou un `actions.json` se trouvent **à côté de l'exe**, ils remplacent
  ceux intégrés : un patch du jeu ne demande pas forcément une nouvelle version *(choix de Claude,
  conforme à « schéma rechargeable » de CLAUDE.md)*.
- Exe **non signé** : Windows SmartScreen affichera un avertissement au premier lancement ; documenté
  dans les README FR / EN *(choix de Claude ; un certificat de signature est payant)*.
- Fenêtre console minimale qui affiche l'adresse et l'état de connexion au jeu (FR / EN).
- Joint aux releases GitHub ; notes de release bilingues comme d'habitude.

### Étapes de livraison

Chaque étape est testable et publiable seule :
1. **Serveur + page PC seulement** : grille par défaut figée, état en direct, appuis, jeton.
2. **Accès réseau local** : réglage, QR code, nouveau jeton.
3. **Grille modifiable** : mode édition, enregistrement côté serveur.
4. **Exécutable** et ajout aux releases.

Chaque étape a son propre plan ; ce document les couvre toutes.

## Laissé au développeur

- Structure exacte des fichiers sous `src/web/` et de la page (HTML/CSS/JS sans framework, ou léger).
- Bibliothèque de QR code (petite, sans dépendance native).
- Mise en page de la grille et du mode édition, dans l'esprit sobre du plugin (fond sombre, tuiles carrées).
- Tests : logique serveur testée comme le reste (faux jeu gRPC, requêtes HTTP réelles sur un port libre).

## Questions ouvertes (pour Remi)

- Garder le réseau local **désactivé par défaut** (proposé, plus sûr) ou l'activer d'office ?
- Grille par défaut : la liste proposée te convient-elle ?
- Morse dans la page : mêmes réglages que la touche (texte, durée, répétitions) — proposé.
- Exe non signé (avertissement SmartScreen) : acceptable, ou faut-il prévoir une signature ?
