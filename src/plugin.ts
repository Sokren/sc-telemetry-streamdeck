import { fileURLToPath } from "node:url";
import streamDeck from "@elgato/streamdeck";
import { ActorAction } from "./actions/actor-action.js";
import { toLang } from "./catalog/labels.js";
import { ActionSource, readSnapshot } from "./catalog/source.js";
import { createGameApi } from "./game/create.js";

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

streamDeck.connect();
