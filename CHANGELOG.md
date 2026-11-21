# Changelog

**EN** English · 🇫🇷 [Français](CHANGELOG.fr.md)

All notable changes to SC Telemetry Deck (Stream Deck plugin and standalone web app for Star Citizen).
Format inspired by [Keep a Changelog](https://keepachangelog.com/); full release notes are in [`docs/releases/`](docs/releases/)
and on the [GitHub releases page](https://github.com/Sokren/sc-telemetry-streamdeck/releases).

> **Beta** — the game's telemetry API is new, undocumented by CIG and may change with any patch.
> 4.10.3 (LIVE) = display only, 5.0 (PTU) = display + actions.

## [0.3.5] — 2026-11-21

### Added
- **Ship Display** (Stream Deck): the ship's **countermeasures** live — decoys and noise together ("45 / 3") or one of them — on a key (value + colored gauge) or a Stream Deck + dial. 100 % = the largest stock seen for this ship model while a display is visible (the game does not send the maximum). Display only: the game exposes no command to fire countermeasures.
- Web app: **Decoys** and **Noise** instruments in the *Ship* tab, the API and the views' *Add* menu.

## [0.3.4] — 2026-11-21

Web app only (Stream Deck plugin unchanged since 0.3.2).

### Added
- **Your views**: build your own tabs (first one: *My view*; **＋** adds more, up to 10) with named sections (half or full
  width) and items picked from an **Add** menu: vitals, instruments, warning lights, ship functions, actions, emotes.
  Drag and drop (mouse or touch), 1× / 2× sizes, padlock to edit / rename / delete. Saved in the app (`view.json`) and kept
  across restarts; each view is saved on its own, so two screens can edit two views at once.
- `?view=<id>` link opens a given view; on a phone the tabs become a list.
- **Tablet / phone access** (📱, PC only): local network switch (off by default), **QR code** and full address hidden every
  time the window opens (no IP on screen), *Copy link*, *Open on [view]*, *New token*, connected-device count without
  addresses, network-card choice (virtual cards left out). Advanced opt-in: listen on all interfaces (0.0.0.0) with a
  warning and a confirmation.
- **About** window: app version, checked game version, whether actions are available, GitHub links.
- API contract 1.2.0: `/api/v1/views`, `/api/v1/lan`, `/api/v1/lan/token`, `/api/v1/lan/qr`, `views` event.

### Third-party
- QR codes made with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), built into the exe.

## [0.3.3] — 2026-11-21

### Added
- Web app: **all 34 player emotes** in the *Character* tab, read live from the game, ✔ / ⚠ when pressed.
- Web app: **app version** next to the title (hover: game version of the embedded schema).

### Docs
- **Star Citizen 4.10.3 (LIVE)** setup: `setx GRPC_CLIENT_SERVER_ENABLED true` (display only; actions need 5.0).
- Beta notice and per-version limits in the README.

### Game
- Schema checked on 5.0 PTU build 13248297 (5.0.202.10025): unchanged (112 actions).

## [0.3.2] — 2026-11-21

### Added
- Detection of game versions without action commands (e.g. 4.10), through the game's API alone:
  Stream Deck keys show ⚠ with a clear log message, the web app shows a banner, displays keep working.
- API: `actions` field (`available` / `unsupported` / `unknown`) in `GET /api/v1/status` and the `status` event
  (contract 1.1.0, additive).

## [0.3.1] — 2026-11-21

### Added
- **`sc-telemetry-web.exe`**: the web app as a single executable — no Node.js needed, the page opens on double-click.
- Updated `sc_extrait.desc` / `actions.json` placed next to the exe are used instead of the embedded ones (after a patch).

### Note
- The exe is not signed: Windows SmartScreen may warn the first time (*More info → Run anyway*).

## [0.3.0] — 2026-11-21

### Added — Stream Deck
- **Ship Toggle**: 17 ship functions with their live state (landing gear, lights, VTOL, transformation, decoupled,
  G-safe, proximity assist, ESP, advanced HUD, night vision, NAV/SCM, engine / weapon / shield power, main power,
  doors); toggle / on only / off only; three styles (text, LED, filled).
- **Ship Action**: every ship and seat command; on / off / toggle variants merged into one entry with a mode setting
  (existing keys converted automatically).
- Dangerous actions (self destruct, eject, power off, opening / unlocking doors) are never offered nor sent.

### Added — web app (preview)
- Button grid, *Character* tab (position, crew role, 13 vitals) and *Ship* tab (instruments, warning lights,
  clickable functions), live, French and English.
- Documented public API (OpenAPI / Swagger at `/api/docs`), token required, this PC only.

## [0.2.0] — 2026-11-21

### Added
- **Actor Display**: a character vital on a key (value + colored gauge) or on a **Stream Deck + dial** (rotate to change
  the value): health, oxygen, hunger, thirst, temperatures, heart rate, gravity, pressure, radiation, intoxication,
  breathable air, balance. "—" when the game is closed or the character has not spawned.
- One shared telemetry stream, opened only while a display is visible.

## [0.1.0] — 2026-11-20

First release.

### Added
- **Actor Action**: character actions (mobiGlas, flashlight, star map, visor wipe) and the 34 emotes, from a grouped list.
- **Morse Code**: flashes the flashlight in Morse code (text, dot length, repetitions).

### Known issues
- In 5.0 PTU the game accepts the `mobiglas` action but does not open the mobiGlas.

[0.3.5]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.5
[0.3.4]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.4
[0.3.3]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.3
[0.3.2]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.2
[0.3.1]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.1
[0.3.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.0
[0.2.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.1.0
