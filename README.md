# SC Telemetry Deck

Plugin Stream Deck pour **Star Citizen**, basé sur l'API de télémétrie locale du jeu (gRPC, `127.0.0.1:2942`).

- Déclencher n'importe quelle action exposée par le jeu (phares, train, portes, master mode, emotes, torche…)
- Afficher l'état réel du vaisseau et du personnage sur les touches (train sorti, phares, boucliers, température…)
- Aucune modification du jeu, aucune lecture mémoire : uniquement l'API locale fournie par le client

> ⚠️ Projet communautaire non officiel, sans lien avec Cloud Imperium Games ni Elgato.
> L'API n'est pas documentée par CIG et peut changer à chaque patch.

> 🚧 En cours de développement.

---

## Prérequis

| | Version minimale |
|---|---|
| Star Citizen | **5.0 (PTU)** — le flux de télémétrie existe depuis 4.10.2, mais le déclenchement d'actions (`TriggerGameAction`) n'apparaît qu'en 5.0 |
| Stream Deck (logiciel) | 7.1 |
| Node.js (développement uniquement) | 24 |

## Activer la télémétrie dans Star Citizen

Le serveur de télémétrie local est **désactivé par défaut**.

1. Ouvre (ou crée) le fichier `user.cfg` à la racine du canal de jeu :
   ```
   …\Roberts Space Industries\StarCitizen\PTU\user.cfg
   ```
   (`LIVE\user.cfg` pour le serveur live, quand la fonctionnalité y sera disponible)

2. Ajoute la ligne :
   ```ini
   server.game.telemetry.enabled=1
   ```

3. Lance le jeu. Dans `Game.log` (même dossier), tu dois trouver :
   ```
   [User CFG ] server.game.telemetry.enabled=true
   <Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered
   <GameTelemetry> Local services server is running on 127.0.0.1:2942
   ```

4. Le flux ne démarre qu'une fois le personnage **spawné** (ligne `Initializing game telemetry component of local player`).

> Alternative non vérifiée ici : la variable d'environnement `GRPC_CLIENT_SERVER_ENABLED=true`
> (à définir avant de lancer le RSI Launcher, qui la transmet au jeu).

Le serveur écoute uniquement sur `127.0.0.1`, sans TLS ni authentification : il n'est pas accessible depuis le réseau.

## L'API en bref

Service `sc.game.telemetry.v1.GameTelemetryService` :

| RPC | Rôle |
|---|---|
| `TelemetryStream` | flux continu (~17 frames/s) : personnage, vaisseau, armes, événements, retour de force, tourelle |
| `ListTriggerableActions` | liste des actions déclenchables (112 en 5.0 PTU, voir [schema/actions.json](schema/actions.json)) |
| `TriggerGameAction` | déclenche une action par son nom (`action_name`, `hold_ms` optionnel) |

Le serveur ne supporte pas la réflexion gRPC : il faut le schéma (`.proto` / `.desc`).
Le schéma est embarqué dans `StarCitizen.exe` ; `tools/sc_extract_proto.py` le reconstruit (voir [schema/](schema/README.md)).

Test rapide avec [grpcurl](https://github.com/fullstorydev/grpcurl) :
```cmd
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/ListTriggerableActions
```

## Outils (`tools/`)

Scripts Python autonomes (`pip install grpcio protobuf`) :

| Script | Rôle |
|---|---|
| `sc_extract_proto.py` | extrait le schéma depuis `StarCitizen.exe` et le compare à un schéma existant |
| `sc_champs_inconnus.py` | affiche les champs envoyés par le jeu mais absents du schéma |
| `sc_bridge.py` | pont HTTP/JSON → gRPC (`http://127.0.0.1:8742/action/<nom>`, `/state`, `/value/<chemin>`) |
| `sc_morse.py` | fait clignoter la torche en morse (`python sc_morse.py SOS`) |
| `toggle_flashlight.pyw` | déclenche l'action portant le nom du fichier, sans fenêtre console |

## Limites connues

- L'état de la **torche** n'est pas exposé (action `toggle_flashlight` uniquement).
- Les événements mort / respawn existent dans le schéma mais ne sont pas émis : se baser sur la santé.
- Une frame peut ne contenir qu'une partie des sections ; les valeurs nulles (`0`, `false`) sont omises (proto3).
- Certaines actions sont **dangereuses** et s'exécutent sans confirmation (`v_self_destruct`, `v_eject`, `v_power_set_off`…).

## Licence

À définir.
