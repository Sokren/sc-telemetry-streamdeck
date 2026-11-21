# SC Telemetry Deck

**EN** English · 🇫🇷 [Français](README.fr.md) · 📜 [Changelog](CHANGELOG.md)

Stream Deck plugin **and standalone web app** for **Star Citizen**, built on the game's local telemetry API (gRPC, `127.0.0.1:2942`).

- Trigger the actions the game exposes (emotes, flashlight, lights, landing gear, doors, master mode…) and see the ship's real state on the key
- Show your character's vitals on your keys and Stream Deck + dials (oxygen, health, temperatures…)
- No Stream Deck? Use the same buttons in your browser, with Character and Ship tabs and a documented API
- No game modification, no memory reading: only the local API provided by the game client

## 🎬 Demo

[![SC Telemetry Deck — demo video (Stream Deck and web app in game)](https://img.youtube.com/vi/t30sASa_oD4/hqdefault.jpg)](https://youtu.be/t30sASa_oD4)

▶️ [Watch on YouTube](https://youtu.be/t30sASa_oD4)

> ⚠️ Unofficial community project, not affiliated with Cloud Imperium Games or Elgato.
> The API is not documented by CIG and may change with any patch.

> [!WARNING]
> **Beta** — tested in game, but the telemetry API is new, undocumented by CIG and may change with any patch.
> What works depends on your game version: **4.10.3 (LIVE) = display only**, **5.0 (PTU) = display + actions**.
> See [Known limitations](#known-limitations). Problems or ideas: [Issues](../../issues).

---

## Installation

1. **Enable telemetry in Star Citizen** — [see the steps below](#enabling-telemetry-in-star-citizen) (one command on 4.10.3 LIVE, one line in `user.cfg` on 5.0 PTU).
2. Download the files from the latest [release](../../releases/latest):
   - **Stream Deck plugin**: `com.sokren.sc-telemetry.streamDeckPlugin` — double-click it, the Stream Deck app installs it. The actions appear under the **Star Citizen** category.
   - **Web app** (no Stream Deck needed): `sc-telemetry-web.exe` — a single file, nothing to install. Double-click it: the page opens in your browser. Windows may show a SmartScreen warning the first time (the file isn't signed): *More info → Run anyway*. After a game patch, you can drop an updated `sc_extrait.desc` / `actions.json` next to the exe.

## Requirements

| | Minimum version |
|---|---|
| Star Citizen | **4.10.3 (LIVE)**: information display only · **5.0 (PTU)**: everything (display + actions — `TriggerGameAction` only appears in 5.0) |
| Stream Deck (app) | 7.1 |
| Node.js (development only) | 24 |

## Enabling telemetry in Star Citizen

The local telemetry server is **disabled by default**. How to turn it on depends on the game version.

### Star Citizen 4.10.3 (LIVE) — environment variable

1. Close the game **and the RSI Launcher** completely (also its icon next to the clock).

2. Open **PowerShell** (Start menu → type `PowerShell`) and run:
   ```powershell
   setx GRPC_CLIENT_SERVER_ENABLED true
   ```
   It answers `SUCCESS: Specified value was saved.` The variable is saved for your Windows account: doing it once is enough.

3. Start the **RSI Launcher**, then the game. The launcher must be started *after* the command: it passes the variable on to the game.

4. Spawn your character: the keys and the web page show your vitals and your ship's state. On 4.10.3, actions (emotes, ship commands…) can't be triggered — see [Known limitations](#known-limitations).

To turn it off again (PowerShell, then restart the launcher):
```powershell
[Environment]::SetEnvironmentVariable("GRPC_CLIENT_SERVER_ENABLED", $null, "User")
```

### Star Citizen 5.0 (PTU) — `user.cfg`

1. Close the game, then go to the folder of the game channel you play, for example:
   ```
   C:\Program Files\Roberts Space Industries\StarCitizen\PTU\
   ```
   (Your install folder may differ.)

2. Open the `user.cfg` file there. If it doesn't exist, create it: in Notepad, *File → Save as*, file name `user.cfg`, type **All files** (not `user.cfg.txt`).

3. Add this line and save:
   ```ini
   server.game.telemetry.enabled=1
   ```

4. Start the game. In `Game.log` (same folder) you should find:
   ```
   [User CFG ] server.game.telemetry.enabled=true
   <Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered
   <GameTelemetry> Local services server is running on 127.0.0.1:2942
   ```

5. The stream only starts once your character has **spawned** (line `Initializing game telemetry component of local player`). Until then, keys and the web page show "—".

The server only listens on `127.0.0.1`, without TLS or authentication: it is not reachable from the network.

## Stream Deck actions

| Action | What it does |
|---|---|
| **Actor Action** | triggers a character action (mobiGlas, flashlight, star map, visor wipe) or an emote (34). Grouped dropdown "Character" / "Emotes", provided by the game when it is running, otherwise by the `schema/actions.json` snapshot. ✔ when the game accepts, ⚠ otherwise (reason in the plugin log). |
| **Morse Code** | flashes the flashlight in Morse code: text, dot length (100–2000 ms) and repetitions are configurable. Pressing again during playback stops it and restores the flashlight. ⚠ The flashlight must be off at start (the game does not expose its state). |
| **Actor Display** | shows a character vital, live: health, oxygen, hunger, thirst, body / outside temperature, heart rate, gravity, pressure, radiation, intoxication, breathable air, balance. On a key: value + colored gauge (green ≥ 50 %, orange 25–50 %, red < 25 %). On a Stream Deck + dial: value and gauge on the touchscreen, **rotate to change the value**. "—" when the game is closed or the character has not spawned. |
| **Ship Display** | shows a ship value, live: **countermeasures** — decoys and noise together ("45 / 3"), or one of them —, **weapons ready to fire** ("1 / 2"), the **active weapon group** or the **gimbals** (locked / free). Same look as Actor Display: value + colored gauge on a key, touchscreen + **rotate to change the value** on a Stream Deck + dial. The game does not send the maximum stock: 100 % = the largest stock seen for this ship model **while a plugin display is visible**. "—" when the game is closed, the character is not seated, or the ship has no countermeasure of that type / no weapons. Display only: the game exposes no command to fire countermeasures, change the weapon group or lock gimbals. |
| **Ship Toggle** | ship function **with its live state**: landing gear, lights, VTOL, transformation, decoupled, G-safe, proximity assist, ESP, advanced HUD, night vision, NAV/SCM mode, engine / weapon / shield power, main power, doors closed / locked. Per key: **mode** (toggle based on the state read, on only, off only) and **style** (A text, B LED, C filled). "—" outside a ship or when the ship lacks the function. Turning main power off, opening and unlocking doors are excluded. |
| **Ship Action** | ship and seat commands without state (flight ready, ATC, ping, hail, quantum, seat modes…), grouped dropdown like Actor Action. **On / off / toggle commands of the same function are merged into one entry** (lights, landing gear, VTOL, power…) with a **mode** setting. Dangerous actions are never offered. |

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

## Web app and public API (preview)

For players **without a Stream Deck**: the same buttons and displays in a browser, served by a small local app. It also exposes a documented **public API (OpenAPI / Swagger)** that any other software can use (stream overlay, bot, dashboard…).

```powershell
npm install
npm run build:web
npm run start:web        # opens the page in your browser (add -- --no-open to skip)
npm run build:exe        # builds dist\sc-telemetry-web.exe (single file, Node SEA)
```

- Page: `http://127.0.0.1:8743/` — the app opens it with the access token included. Tabs: **Grid** (buttons), **Character** (position, crew role, all 13 vitals and the 34 emotes, clickable), **Ship** (instruments — including decoys and noise countermeasures, weapons ready, weapon group and gimbals —, warning lights and the 17 functions, clickable) and **your views** (first one: **My view**; **＋** adds more, up to 10): your own layouts, with named sections (half or full width) and the items you pick from an **Add** menu (vitals, instruments, warning lights, ship functions, actions, emotes), moved by drag and drop (mouse or touch). Unlock a view with the padlock to edit, rename or delete it, lock it to use it. Views are saved in the app (`view.json` next to `settings.json`) and kept when it restarts: one view per screen (PC, tablet, phone…), and a link ending in `?view=<id>` opens a given view directly (the device remembers it; the tabs, or a list on a phone, switch views). **🔁 Auto** (per device): opens a chosen view by itself when your character is on foot, seated or in EVA, after 2 s in the same position, never while you edit a view.
- Swagger UI: `http://127.0.0.1:8743/api/docs` — contract: `/api/v1/openapi.json`.
- Every API call needs the token (`Authorization: Bearer …`), stored in `%APPDATA%\SC Telemetry Deck\settings.json`.
- **Tablet / phone** (button in the header, on the PC only): turn on **Allow access from the local network**, then scan the **QR code** with the tablet's camera (same Wi-Fi as the PC). The QR code and the full address are **hidden** every time the window opens (no IP on screen, handy when streaming); **Copy link** works even while hidden. **Open on** picks the view the link opens. **New token** disconnects every other device. The first time, Windows may ask to allow the app through the firewall: tick **Private networks**.
  - Off by default: the app then listens on **this PC only** (`127.0.0.1`). On: this PC plus the chosen network card (virtual cards — WSL, Hyper-V, VirtualBox, VPN… — are left out). Only the PC can change these settings or see the link.
  - The connection is **not encrypted** and the link contains the token: use it at home, not on public Wi-Fi.
  - Advanced option, **at your own risk**: **Listen on all interfaces (0.0.0.0)** exposes the app on every network card of the PC (VPNs, virtual machines, public Wi-Fi…): anyone there who gets the link can control the game.
- Same safety rules as the plugin: dangerous actions are never sent, whatever the request.

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
| `sc_actions_diff.py` | after a patch: lists commands added / removed in `StarCitizen.exe` (no game needed) and triggerable actions added / removed (game running), updates `schema/actions.json` |
| `sc_bridge.py` | HTTP/JSON → gRPC bridge (`http://127.0.0.1:8742/action/<name>`, `/state`, `/value/<path>`) |
| `sc_morse.py` | flashes the flashlight in Morse code (`python sc_morse.py SOS`) |
| `toggle_flashlight.pyw` | triggers the action named after the file, without a console window |

The scripts' messages and comments are in French.

## Known limitations

- **Game version**: on **4.10.3 (LIVE)**, only information display works (vitals, ship state, Character and Ship tabs). Triggering actions — emotes, ship commands, Ship Toggle presses, Morse — needs **5.0** (PTU for now): on 4.10.3 keys show ⚠ and the web page shows a banner.
- **Windows only** (Stream Deck plugin and web app).
- The **flashlight** state is not exposed (only the `toggle_flashlight` action).
- In 5.0 PTU, the game accepts the `mobiglas` action but does not open the mobiGlas.
- Death / respawn events exist in the schema but are not emitted: rely on health instead.
- A frame may contain only some sections; zero values (`0`, `false`) are omitted (proto3).
- Some game actions are **dangerous** and run without confirmation (`v_self_destruct`, `v_eject`, `v_power_set_off`, opening / unlocking doors…). The plugin never offers nor triggers them; the `tools/` scripts do not filter them.

## License

To be decided.

Third-party: the web app's QR codes are made with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT license). “QR Code” is a registered trademark of DENSO WAVE INCORPORATED.
