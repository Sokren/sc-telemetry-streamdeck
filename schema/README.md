# Schéma de l'API

CIG ne publie pas le `.proto`. Il est reconstruit à partir des descripteurs protobuf embarqués dans `StarCitizen.exe`.

**Version actuelle : Star Citizen 5.0.202.205 PTU (build 13238477)**, extraite le 2026-11-20.

## Fichiers

| Fichier | Rôle |
|---|---|
| `sc_extrait.desc` | **Référence.** `FileDescriptorSet` binaire (`types.proto` + `api.proto`) : chargé par le plugin, les scripts de `tools/` et `grpcurl -protoset` |
| `sc_extrait.proto` | Version lisible, pour consultation (les deux fichiers concaténés : non compilable tel quel par `protoc`) |
| `actions.json` | Instantané de `ListTriggerableActions` (112 actions) : documentation seulement, le plugin interroge toujours le jeu |

- Package : `sc.game.telemetry.v1`
- Service : `GameTelemetryService` (`TelemetryStream`, `ListTriggerableActions`, `TriggerGameAction`)

Les scripts de `tools/` cherchent `sc_extrait.desc` à côté d'eux, puis dans `schema/`.

## Mettre à jour après un patch

Depuis le dossier `schema/` :

```powershell
$exe = "J:\Jeux\Roberts Space Industries\StarCitizen\PTU\Bin64\StarCitizen.exe"   # adapter
Copy-Item sc_extrait.desc ancien.desc
python ..\tools\sc_extract_proto.py $exe --compare ancien.desc
Remove-Item ancien.desc
```

Puis, jeu lancé et perso spawné :

```powershell
python ..\tools\sc_champs_inconnus.py   # doit ne rien afficher si le schéma est complet
```

La version du jeu est dans `Game.log` (`FileVersion:` et `Build(…)`).
Vérifier les différences avec `git diff`, et nommer le commit avec la version du jeu, par ex. `schema: 5.0 PTU build 13238477`.
