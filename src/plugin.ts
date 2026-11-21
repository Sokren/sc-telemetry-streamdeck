import { fileURLToPath } from "node:url";
import streamDeck from "@elgato/streamdeck";
import { ActorAction } from "./actions/actor-action.js";
import { ActorDisplayAction } from "./actions/actor-display-action.js";
import { TRIGGER_TIMEOUT_MS } from "./actions/category-action.js";
import { MorseCodeAction } from "./actions/morse-code-action.js";
import { ShipAction } from "./actions/ship-action.js";
import { ShipDisplayAction } from "./actions/ship-display-action.js";
import { ShipToggleRegistered } from "./actions/ship-toggle-registered.js";
import { toLang } from "./catalog/labels.js";
import { ActionSource, readSnapshot } from "./catalog/source.js";
import { createGameApi } from "./game/create.js";
import { MorsePlayer } from "./morse/player.js";
import { TelemetryHub } from "./telemetry/hub.js";

// bin/plugin.js → dossier du plugin ; data/ est rempli par la construction depuis schema/.
const dataFile = (name: string) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

streamDeck.logger.setLevel("info");

const game = createGameApi(dataFile("sc_extrait.desc"), (msg) => streamDeck.logger.error(msg));
const source = new ActionSource(game, () => readSnapshot(dataFile("actions.json")));

streamDeck.actions.registerAction(
	new ActorAction({
		game,
		source,
		lang: () => toLang(streamDeck.info.application.language ?? "en"),
		sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
		log: (msg) => streamDeck.logger.info(msg),
	}),
);

/** Attente interrompue dès que l'émission est arrêtée. */
const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal.aborted) return resolve();
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
	});

// Un seul lecteur pour toutes les touches Morse : la torche est commune.
const morsePlayer = new MorsePlayer(async () => (await game.trigger("toggle_flashlight", TRIGGER_TIMEOUT_MS)).ok, wait);
streamDeck.actions.registerAction(new MorseCodeAction({ player: morsePlayer, log: (msg) => streamDeck.logger.info(msg) }));

// Un seul flux de télémétrie pour tous les afficheurs ; ouvert seulement s'il y en a un de visible.
const hub = new TelemetryHub(game);
streamDeck.actions.registerAction(
	new ActorDisplayAction({
		hub,
		lang: () => toLang(streamDeck.info.application.language ?? "en"),
		sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
	}),
);

streamDeck.actions.registerAction(
	new ShipDisplayAction({
		hub,
		lang: () => toLang(streamDeck.info.application.language ?? "en"),
		sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
	}),
);

streamDeck.actions.registerAction(
	new ShipToggleRegistered({
		hub,
		game,
		lang: () => toLang(streamDeck.info.application.language ?? "en"),
		sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
		log: (msg) => streamDeck.logger.info(msg),
	}),
);

streamDeck.actions.registerAction(
	new ShipAction({
		game,
		source,
		lang: () => toLang(streamDeck.info.application.language ?? "en"),
		sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
		log: (msg) => streamDeck.logger.info(msg),
	}),
);

streamDeck.connect();
