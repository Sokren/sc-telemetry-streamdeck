# SC Telemetry Deck

🇬🇧 **English** · 🇫🇷 [Français](README.fr.md)

Stream Deck plugin for **Star Citizen**, built on the game's local telemetry API (gRPC, `127.0.0.1:2942`).

- Trigger the actions the game exposes (emotes, flashlight, lights, landing gear, doors, master mode…) and see the ship's real state on the key
- Show your character's vitals on your keys and Stream Deck + dials (oxygen, health, temperatures…)
- No game modification, no memory reading: only the local API provided by the game client

> ⚠️ Unofficial community project, not affiliated with Cloud Imperium Games or Elgato.
> The API is not documented by CIG and may change with any patch.

> 🚧 Work in progress.

---

## Installation

1. Enable telemetry in Star Citizen (see below).
2. Download `com.sokren.sc-telemetry.streamDeckPlugin` from the latest [release](../../releases/latest).
3. Double-click it: the Stream Deck app installs it. The actions appear under the **Star Citizen** category.

## Requirements

| | Minimum version |
|---|---|
| Star Citizen | **5.0 (PTU)** — the telemetry stream exists since 4.10.2, but triggering actions (`TriggerGameAction`) only appears in 5.0 |
| Stream Deck (app) | 7.1 |
| Node.js (development only) | 24 |

## Enabling telemetry in Star Citizen

The local telemetry server is **disabled by default**.

1. Open (or create) the `user.cfg` file at the root of the game channel:
   ```
   …\Roberts Space Industries\StarCitizen\PTU\user.cfg
   ```
   (`LIVE\user.cfg` for the live server, once the feature is available there)

2. Add the line:
   ```ini
   server.game.telemetry.enabled=1
   ```

3. Start the game. In `Game.log` (same folder) you should find:
   ```
   [User CFG ] server.game.telemetry.enabled=true
   <Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered
   <GameTelemetry> Local services server is running on 127.0.0.1:2942
   ```

4. The stream only starts once your character has **spawned** (line `Initializing game telemetry component of local player`).

> Not verified here: the environment variable `GRPC_CLIENT_SERVER_ENABLED=true`
> (set before starting the RSI Launcher, which passes it on to the game).

The server only listens on `127.0.0.1`, without TLS or authentication: it is not reachable from the network.

## Stream Deck actions

| Action | What it does |
|---|---|
| **Actor Action** | triggers a character action (mobiGlas, flashlight, star map, visor wipe) or an emote (34). Grouped dropdown "Character" / "Emotes", provided by the game when it is running, otherwise by the `schema/actions.json` snapshot. ✔ when the game accepts, ⚠ otherwise (reason in the plugin log). |
| **Morse Code** | flashes the flashlight in Morse code: text, dot length (100–2000 ms) and repetitions are configurable. Pressing again during playback stops it and restores the flashlight. ⚠ The flashlight must be off at start (the game does not expose its state). |
| **Actor Display** | shows a character vital, live: health, oxygen, hunger, thirst, body / outside temperature, heart rate, gravity, pressure, radiation, intoxication, breathable air, balance. On a key: value + colored gauge (green ≥ 50 %, orange 25–50 %, red < 25 %). On a Stream Deck + dial: value and gauge on the touchscreen, **rotate to change the value**. "—" when the game is closed or the character has not spawned. |
| **Ship Toggle** | ship function **with its live state**: landing gear, lights, VTOL, transformation, decoupled, G-safe, proximity assist, ESP, advanced HUD, night vision, NAV/SCM mode, engine / weapon / shield power, main power, doors closed / locked. Per key: **mode** (toggle based on the state read, on only, off only) and **style** (A text, B LED, C filled). "—" outside a ship or when the ship lacks the function. Turning main power off, opening and unlocking doors are excluded. |
| **Ship Action** | ship and seat commands without state (flight ready, ATC, ping, hail, quantum, seat modes…), grouped dropdown like Actor Action. Dangerous actions are never offered. |

Labels follow the Stream Deck app language (French, otherwise English).

## The API in short

Service `sc.game.telemetry.v1.GameTelemetryService`:

| RPC | Purpose |
|---|---|
| `TelemetryStream` | continuous stream (~17 frames/s): character, vehicle, weapons, events, force feedback, turret |
| `ListTriggerableActions` | list of triggerable actions (112 in 5.0 PTU, see [schema/actions.json](schema/actions.json)) |
| `TriggerGameAction` | triggers an action by name (`action_name`, optional `hold_ms`) |

The server does not support gRPC reflection: you need the schema (`.proto` / `.desc`).
The schema is embedded in `StarCitizen.exe`; `tools/sc_extract_proto.py` rebuilds it (see [schema/](schema/README.md)).

Quick test with [grpcurl](https://github.com/fullstorydev/grpcurl):
```cmd
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/ListTriggerableActions
```

## Plugin development

```powershell
npm install
npm test                 # tests (fake gRPC server built on the real schema)
npm run build            # builds com.sokren.sc-telemetry.sdPlugin\bin\plugin.js and copies schema\ into data\
npx streamdeck validate com.sokren.sc-telemetry.sdPlugin
npx streamdeck link com.sokren.sc-telemetry.sdPlugin   # once; then restart the Stream Deck app
npm run watch            # rebuilds and restarts the plugin on every change
```

Plugin log: `com.sokren.sc-telemetry.sdPlugin\logs\`.

### Publishing a release

```powershell
npm test; npm run build
npx streamdeck pack com.sokren.sc-telemetry.sdPlugin -o dist -f
git tag -a vX.Y.Z -m "SC Telemetry Deck X.Y.Z"; git push origin main vX.Y.Z
gh release create vX.Y.Z dist\com.sokren.sc-telemetry.streamDeckPlugin --title "SC Telemetry Deck X.Y.Z" --notes-file docs\releases\vX.Y.Z.md
```

Release notes live in `docs/releases/vX.Y.Z.md` and are **bilingual**: English first, then French, separated by a `---` line.
Update `Version` in the manifest before packing.

## Tools (`tools/`)

Standalone Python scripts (`pip install grpcio protobuf`):

| Script | Purpose |
|---|---|
| `sc_extract_proto.py` | extracts the schema from `StarCitizen.exe` and compares it with an existing one |
| `sc_champs_inconnus.py` | shows fields sent by the game but missing from the schema |
| `sc_bridge.py` | HTTP/JSON → gRPC bridge (`http://127.0.0.1:8742/action/<name>`, `/state`, `/value/<path>`) |
| `sc_morse.py` | flashes the flashlight in Morse code (`python sc_morse.py SOS`) |
| `toggle_flashlight.pyw` | triggers the action named after the file, without a console window |

The scripts' messages and comments are in French.

## Known limitations

- The **flashlight** state is not exposed (only the `toggle_flashlight` action).
- In 5.0 PTU, the game accepts the `mobiglas` action but does not open the mobiGlas.
- Death / respawn events exist in the schema but are not emitted: rely on health instead.
- A frame may contain only some sections; zero values (`0`, `false`) are omitted (proto3).
- Some game actions are **dangerous** and run without confirmation (`v_self_destruct`, `v_eject`, `v_power_set_off`, opening / unlocking doors…). The plugin never offers nor triggers them; the `tools/` scripts do not filter them.

## License

To be decided.
