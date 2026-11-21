# SC Telemetry Deck

**EN** [English](README.md) · 🇫🇷 **Français**

Plugin Stream Deck **et appli web autonome** pour **Star Citizen**, basés sur l'API de télémétrie locale du jeu (gRPC, `127.0.0.1:2942`).

- Déclencher les actions exposées par le jeu (émotes, torche, phares, train, portes, master mode…) et voir l'état réel du vaisseau sur la touche
- Afficher les constantes du personnage sur les touches et les molettes du Stream Deck + (oxygène, santé, températures…)
- Pas de Stream Deck ? Les mêmes boutons dans ton navigateur, avec les onglets Personnage et Vaisseau et une API documentée
- Aucune modification du jeu, aucune lecture mémoire : uniquement l'API locale fournie par le client

## 🎬 Démo

[![SC Telemetry Deck — vidéo de démo (Stream Deck et appli web en jeu)](https://img.youtube.com/vi/t30sASa_oD4/hqdefault.jpg)](https://youtu.be/t30sASa_oD4)

▶️ [Voir sur YouTube](https://youtu.be/t30sASa_oD4)

> ⚠️ Projet communautaire non officiel, sans lien avec Cloud Imperium Games ni Elgato.
> L'API n'est pas documentée par CIG et peut changer à chaque patch.

> [!WARNING]
> **Bêta** — testé en jeu, mais l'API de télémétrie est récente, non documentée par CIG et peut changer à chaque patch.
> Ce qui fonctionne dépend de ta version du jeu : **4.10.3 (LIVE) = affichage seulement**, **5.0 (PTU) = affichage + actions**.
> Voir [Limites connues](#limites-connues). Problèmes ou idées : [Issues](../../issues).

---

## Installation

1. **Active la télémétrie dans Star Citizen** — [voir les étapes ci-dessous](#activer-la-télémétrie-dans-star-citizen) (une commande en 4.10.3 LIVE, une ligne dans `user.cfg` en 5.0 PTU).
2. Télécharge les fichiers de la dernière [release](../../releases/latest) :
   - **Plugin Stream Deck** : `com.sokren.sc-telemetry.streamDeckPlugin` — double-clique dessus, le logiciel Stream Deck l'installe. Les actions apparaissent dans la catégorie **Star Citizen**.
   - **Appli web** (sans Stream Deck) : `sc-telemetry-web.exe` — un seul fichier, rien à installer. Double-clique dessus : la page s'ouvre dans ton navigateur. Windows peut afficher un avertissement SmartScreen la première fois (le fichier n'est pas signé) : *Informations complémentaires → Exécuter quand même*. Après un patch du jeu, tu peux poser un `sc_extrait.desc` / `actions.json` à jour à côté de l'exe.

## Prérequis

| | Version minimale |
|---|---|
| Star Citizen | **4.10.3 (LIVE)** : affichage des informations seulement · **5.0 (PTU)** : tout (affichage + actions — `TriggerGameAction` n'apparaît qu'en 5.0) |
| Stream Deck (logiciel) | 7.1 |
| Node.js (développement uniquement) | 24 |

## Activer la télémétrie dans Star Citizen

Le serveur de télémétrie local est **désactivé par défaut**. La façon de l'activer dépend de la version du jeu.

### Star Citizen 4.10.3 (LIVE) — variable d'environnement

1. Ferme complètement le jeu **et le RSI Launcher** (y compris son icône à côté de l'horloge).

2. Ouvre **PowerShell** (menu Démarrer → tape `PowerShell`) et lance :
   ```powershell
   setx GRPC_CLIENT_SERVER_ENABLED true
   ```
   Il répond `Opération réussie : la valeur spécifiée a été enregistrée.` La variable est enregistrée pour ton compte Windows : une seule fois suffit.

3. Lance le **RSI Launcher**, puis le jeu. Le launcher doit être lancé *après* la commande : c'est lui qui transmet la variable au jeu.

4. Fais apparaître ton perso : les touches et la page web affichent tes constantes et l'état de ton vaisseau. En 4.10.3, les actions (émotes, commandes du vaisseau…) ne peuvent pas être déclenchées — voir [Limites connues](#limites-connues).

Pour la désactiver (PowerShell, puis relance le launcher) :
```powershell
[Environment]::SetEnvironmentVariable("GRPC_CLIENT_SERVER_ENABLED", $null, "User")
```

### Star Citizen 5.0 (PTU) — `user.cfg`

1. Ferme le jeu, puis va dans le dossier du canal de jeu sur lequel tu joues, par exemple :
   ```
   C:\Program Files\Roberts Space Industries\StarCitizen\PTU\
   ```
   (Ton dossier d'installation peut être différent.)

2. Ouvre le fichier `user.cfg` qui s'y trouve. S'il n'existe pas, crée-le : dans le Bloc-notes, *Fichier → Enregistrer sous*, nom `user.cfg`, type **Tous les fichiers** (pas `user.cfg.txt`).

3. Ajoute cette ligne et enregistre :
   ```ini
   server.game.telemetry.enabled=1
   ```

4. Lance le jeu. Dans `Game.log` (même dossier), tu dois trouver :
   ```
   [User CFG ] server.game.telemetry.enabled=true
   <Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered
   <GameTelemetry> Local services server is running on 127.0.0.1:2942
   ```

5. Le flux ne démarre qu'une fois le personnage **apparu** (ligne `Initializing game telemetry component of local player`). D'ici là, les touches et la page web affichent « — ».

Le serveur écoute uniquement sur `127.0.0.1`, sans TLS ni authentification : il n'est pas accessible depuis le réseau.

## Actions Stream Deck

| Action | Rôle |
|---|---|
| **Actor Action** | déclenche une action du personnage (mobiGlas, torche, carte stellaire, visière) ou une émote (34). Liste déroulante groupée « Personnage » / « Émotes », fournie par le jeu s'il tourne, sinon par l'instantané `schema/actions.json`. ✔ si le jeu accepte, ⚠ sinon (raison dans le journal du plugin). |
| **Morse Code** | fait clignoter la torche en morse : texte, durée d'un point (100–2000 ms) et répétitions réglables. Un appui pendant l'émission l'arrête et remet la torche dans son état de départ. ⚠ La torche doit être éteinte au départ (le jeu n'expose pas son état). |
| **Actor Display** | affiche une constante du personnage en continu : santé, oxygène, faim, soif, température corporelle / extérieure, rythme cardiaque, gravité, pression, rayonnement, intoxication, atmosphère respirable, solde. Sur une touche : valeur + jauge colorée (vert ≥ 50 %, orange 25–50 %, rouge < 25 %). Sur une molette de Stream Deck + : valeur et jauge sur l'écran tactile, **tourner pour changer de donnée**. « — » si le jeu est fermé ou le perso pas encore apparu. |
| **Ship Toggle** | fonction du vaisseau **avec son état réel** : train, phares, VTOL, transformation, découplage, G-safe, assistance de proximité, ESP, HUD avancé, vision nocturne, mode NAV/SCM, puissance moteurs / armes / boucliers, puissance générale, portes fermées / verrouillées. Par touche : **mode** (bascule selon l'état lu, allumer seulement, éteindre seulement) et **style** (A texte, B voyant, C fond coloré). « — » hors du vaisseau ou si le vaisseau n'a pas la fonction. Couper toute la puissance, ouvrir et déverrouiller les portes sont exclus. |
| **Ship Action** | commandes du vaisseau et du siège sans état (prêt au vol, ATC, ping, héler, quantum, modes du siège…), liste groupée comme Actor Action. **Les commandes on / off / bascule d'une même fonction sont regroupées en une ligne** (phares, train, VTOL, puissance…) avec un réglage de **mode**. Les actions dangereuses ne sont jamais proposées. |

Les libellés suivent la langue du logiciel Stream Deck (français, sinon anglais).

## L'API en bref

Service `sc.game.telemetry.v1.GameTelemetryService` :

| RPC | Rôle |
|---|---|
| `TelemetryStream` | flux continu (~17 frames/s) : personnage, vaisseau, armes, événements, retour de force, tourelle |
| `ListTriggerableActions` | liste des actions déclenchables (112 en 5.0 PTU, voir [schema/actions.json](schema/actions.json)) |
| `TriggerGameAction` | déclenche une action par son nom (`action_name`, `hold_ms` optionnel) |

Le serveur ne supporte pas la réflexion gRPC : il faut le schéma (`.proto` / `.desc`).
Le schéma est embarqué dans `StarCitizen.exe` ; `tools/sc_extract_proto.py` le reconstruit (voir [schema/](schema/README.fr.md)).

Test rapide avec [grpcurl](https://github.com/fullstorydev/grpcurl) :
```cmd
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/ListTriggerableActions
```

## Appli web et API publique (aperçu)

Pour les joueurs **sans Stream Deck** : les mêmes boutons et afficheurs dans un navigateur, servis par une petite appli locale. Elle expose aussi une **API publique documentée (OpenAPI / Swagger)** utilisable par n'importe quel autre logiciel (overlay de stream, bot, tableau de bord…).

```powershell
npm install
npm run build:web
npm run start:web        # ouvre la page dans le navigateur (ajouter -- --no-open pour ne pas l'ouvrir)
npm run build:exe        # fabrique dist\sc-telemetry-web.exe (un seul fichier, Node SEA)
```

- Page : `http://127.0.0.1:8743/` — l'appli l'ouvre avec le jeton d'accès inclus. Onglets : **Grille** (boutons), **Personnage** (position, rôle, les 13 constantes et les 34 émotes, cliquables), **Vaisseau** (instruments, voyants et les 17 fonctions, cliquables) et **tes vues** (la première : **Ma vue** ; **＋** en ajoute, jusqu'à 10) : tes propres dispositions, avec des sections nommées (demi ou pleine largeur) et les cases que tu choisis dans un menu **Ajouter** (constantes, instruments, voyants, fonctions du vaisseau, actions, émotes), déplacées par glisser-déposer (souris ou doigt). Déverrouille une vue avec le cadenas pour la modifier, la renommer ou la supprimer, verrouille-la pour l'utiliser. Les vues sont enregistrées dans l'appli (`view.json` à côté de `settings.json`) et gardées quand elle redémarre : une vue par écran (PC, tablette, téléphone…), et un lien finissant par `?view=<id>` ouvre directement une vue (l'appareil s'en souvient ; les onglets, ou une liste sur téléphone, changent de vue).
- Swagger UI : `http://127.0.0.1:8743/api/docs` — contrat : `/api/v1/openapi.json`.
- Chaque appel à l'API demande le jeton (`Authorization: Bearer …`), enregistré dans `%APPDATA%\SC Telemetry Deck\settings.json`.
- **Tablette / téléphone** (bouton dans l'en-tête, sur le PC seulement) : active **Autoriser l'accès depuis le réseau local**, puis scanne le **QR code** avec l'appareil photo de la tablette (même Wi-Fi que le PC). Le QR code et l'adresse complète sont **masqués** à chaque ouverture de la fenêtre (aucune IP à l'écran, pratique si tu streames) ; **Copier le lien** marche même masqué. **Ouvrir sur** choisit la vue que le lien ouvre. **Nouveau jeton** déconnecte tous les autres appareils. La première fois, Windows peut demander d'autoriser l'appli dans le pare-feu : coche **Réseaux privés**.
  - Désactivé par défaut : l'appli n'écoute alors que **sur ce PC** (`127.0.0.1`). Activé : ce PC plus la carte réseau choisie (les cartes virtuelles — WSL, Hyper-V, VirtualBox, VPN… — sont écartées). Seul le PC peut changer ces réglages ou voir le lien.
  - La connexion **n'est pas chiffrée** et le lien contient le jeton : à utiliser chez toi, pas sur un Wi-Fi public.
  - Option avancée, **à tes risques** : **Écouter sur toutes les interfaces (0.0.0.0)** expose l'appli sur toutes les cartes réseau du PC (VPN, machines virtuelles, Wi-Fi public…) : n'importe qui là-dessus qui obtient le lien peut piloter le jeu.
- Mêmes règles de sécurité que le plugin : les actions dangereuses ne sont jamais envoyées, quelle que soit la requête.

## Développement du plugin

```powershell
npm install
npm test                 # tests (faux serveur gRPC construit sur le vrai schéma)
npm run build            # construit com.sokren.sc-telemetry.sdPlugin\bin\plugin.js et copie schema\ dans data\
npx streamdeck validate com.sokren.sc-telemetry.sdPlugin
npx streamdeck link com.sokren.sc-telemetry.sdPlugin   # une fois ; redémarrer ensuite le logiciel Stream Deck
npm run watch            # reconstruit et redémarre le plugin à chaque modification
```

Journal du plugin : `com.sokren.sc-telemetry.sdPlugin\logs\`.

### Publier une release

```powershell
npm test; npm run build
npx streamdeck pack com.sokren.sc-telemetry.sdPlugin -o dist -f
git tag -a vX.Y.Z -m "SC Telemetry Deck X.Y.Z"; git push origin main vX.Y.Z
gh release create vX.Y.Z dist\com.sokren.sc-telemetry.streamDeckPlugin --title "SC Telemetry Deck X.Y.Z" --notes-file docs\releases\vX.Y.Z.md
```

Les notes de release sont dans `docs/releases/vX.Y.Z.md`, **bilingues** : anglais d’abord, puis français, séparés par une ligne `---`.
Mettre à jour `Version` dans le manifeste avant d'empaqueter.

## Outils (`tools/`)

Scripts Python autonomes (`pip install grpcio protobuf`) :

| Script | Rôle |
|---|---|
| `sc_extract_proto.py` | extrait le schéma depuis `StarCitizen.exe` et le compare à un schéma existant |
| `sc_champs_inconnus.py` | affiche les champs envoyés par le jeu mais absents du schéma |
| `sc_actions_diff.py` | après un patch : liste les commandes ajoutées / retirées dans `StarCitizen.exe` (sans le jeu) et les actions déclenchables ajoutées / retirées (jeu lancé), met à jour `schema/actions.json` |
| `sc_bridge.py` | pont HTTP/JSON → gRPC (`http://127.0.0.1:8742/action/<nom>`, `/state`, `/value/<chemin>`) |
| `sc_morse.py` | fait clignoter la torche en morse (`python sc_morse.py SOS`) |
| `toggle_flashlight.pyw` | déclenche l'action portant le nom du fichier, sans fenêtre console |

## Limites connues

- **Version du jeu** : en **4.10.3 (LIVE)**, seul l'affichage des informations fonctionne (constantes, état du vaisseau, onglets Personnage et Vaisseau). Le déclenchement d'actions — émotes, commandes du vaisseau, appuis Ship Toggle, morse — demande la **5.0** (PTU pour l'instant) : en 4.10.3, les touches affichent ⚠ et la page web affiche un bandeau.
- **Windows uniquement** (plugin Stream Deck et appli web).
- L'état de la **torche** n'est pas exposé (action `toggle_flashlight` uniquement).
- En 5.0 PTU, le jeu accepte l'action `mobiglas` mais n'ouvre pas le mobiGlas.
- Les événements mort / respawn existent dans le schéma mais ne sont pas émis : se baser sur la santé.
- Une frame peut ne contenir qu'une partie des sections ; les valeurs nulles (`0`, `false`) sont omises (proto3).
- Certaines actions du jeu sont **dangereuses** et s'exécutent sans confirmation (`v_self_destruct`, `v_eject`, `v_power_set_off`, ouverture / déverrouillage des portes…). Le plugin ne les propose ni ne les déclenche jamais ; les scripts de `tools/` ne les filtrent pas.

## Licence

À définir.

Tiers : les QR codes de l'appli web sont faits avec [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) de Kazuhiko Arase (licence MIT). « QR Code » est une marque déposée de DENSO WAVE INCORPORATED.
