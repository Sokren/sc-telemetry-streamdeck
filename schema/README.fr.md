# Schéma de l'API

**EN** [English](README.md) · 🇫🇷 **Français**

CIG ne publie pas le `.proto`. Il est reconstruit à partir des descripteurs protobuf embarqués dans `StarCitizen.exe`.

**Version actuelle : Star Citizen 5.0.202.205 PTU (build 13238477)**, extraite le 2026-11-20.

## Fichiers

| Fichier | Rôle |
|---|---|
| `sc_extrait.desc` | **Référence.** `FileDescriptorSet` binaire (`types.proto` + `api.proto`) : chargé par le plugin, les scripts de `tools/` et `grpcurl -protoset` |
| `sc_extrait.proto` | Version lisible, pour consultation (les deux fichiers concaténés : non compilable tel quel par `protoc`) |
| `actions.json` | Instantané de `ListTriggerableActions` (112 actions) : documentation et liste de secours quand le jeu est fermé ; le plugin interroge toujours le jeu d'abord |
| `command_names.json` | Table des noms de commandes lue dans `StarCitizen.exe` (948 noms, déclenchables ou non) : référence pour repérer les commandes ajoutées par un patch |

- Package : `sc.game.telemetry.v1`
- Service : `GameTelemetryService` (`TelemetryStream`, `ListTriggerableActions`, `TriggerGameAction`)

Les scripts de `tools/` cherchent `sc_extrait.desc` à côté d'eux, puis dans `schema/`.
Le plugin copie `sc_extrait.desc` et `actions.json` dans son dossier `data/` à chaque construction.

## Mettre à jour après un patch

Depuis le dossier `schema/` :

```powershell
$exe = "J:\Jeux\Roberts Space Industries\StarCitizen\PTU\Bin64\StarCitizen.exe"   # adapter
Copy-Item sc_extrait.desc ancien.desc
python ..\tools\sc_extract_proto.py $exe --compare ancien.desc
Remove-Item ancien.desc
```

Repérer les nouvelles commandes (sans le jeu), puis enregistrer la nouvelle référence :

```powershell
python ..\tools\sc_actions_diff.py exe $exe --compare command_names.json
python ..\tools\sc_actions_diff.py exe $exe --save command_names.json --version "5.0 PTU build XXXXX"
```

Puis, jeu lancé et perso spawné :

```powershell
python ..\tools\sc_champs_inconnus.py   # doit ne rien afficher si le schéma est complet
python ..\tools\sc_actions_diff.py live  # actions déclenchables ajoutées / retirées
python ..\tools\sc_actions_diff.py live --update --version "5.0 PTU build XXXXX"   # met à jour actions.json
```

Les nouvelles actions apparaissent seules dans le plugin (la liste vient du jeu) ; ajouter leurs libellés FR / EN dans `src/catalog/labels.*.json`.

La version du jeu est dans `Game.log` (`FileVersion:` et `Build(…)`).
Vérifier les différences avec `git diff`, et nommer le commit avec la version du jeu, par ex. `schema: 5.0 PTU build 13238477`.
