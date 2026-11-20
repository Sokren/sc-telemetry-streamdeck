# API schema

🇬🇧 **English** · 🇫🇷 [Français](README.fr.md)

CIG does not publish the `.proto`. It is rebuilt from the protobuf descriptors embedded in `StarCitizen.exe`.

**Current version: Star Citizen 5.0.202.205 PTU (build 13238477)**, extracted on 2026-11-20.

## Files

| File | Purpose |
|---|---|
| `sc_extrait.desc` | **Reference.** Binary `FileDescriptorSet` (`types.proto` + `api.proto`): loaded by the plugin, the `tools/` scripts and `grpcurl -protoset` |
| `sc_extrait.proto` | Readable version, for reference (both files concatenated: not compilable as is by `protoc`) |
| `actions.json` | Snapshot of `ListTriggerableActions` (112 actions): documentation and fallback list when the game is closed; the plugin always asks the game first |

- Package: `sc.game.telemetry.v1`
- Service: `GameTelemetryService` (`TelemetryStream`, `ListTriggerableActions`, `TriggerGameAction`)

The `tools/` scripts look for `sc_extrait.desc` next to themselves, then in `schema/`.
The plugin copies `sc_extrait.desc` and `actions.json` into its `data/` folder on every build.

## Updating after a patch

From the `schema/` folder:

```powershell
$exe = "J:\Jeux\Roberts Space Industries\StarCitizen\PTU\Bin64\StarCitizen.exe"   # adjust
Copy-Item sc_extrait.desc ancien.desc
python ..\tools\sc_extract_proto.py $exe --compare ancien.desc
Remove-Item ancien.desc
```

Then, with the game running and your character spawned:

```powershell
python ..\tools\sc_champs_inconnus.py   # should print nothing if the schema is complete
```

The game version is in `Game.log` (`FileVersion:` and `Build(…)`).
Check the differences with `git diff`, and name the commit after the game version, e.g. `schema: 5.0 PTU build 13238477`.
