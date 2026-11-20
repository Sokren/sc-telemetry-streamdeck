import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { groupLabel, humanize, labelFor, toLang } from "../../src/catalog/labels.js";
import en from "../../src/catalog/labels.en.json" with { type: "json" };
import fr from "../../src/catalog/labels.fr.json" with { type: "json" };

const snapshot = JSON.parse(fs.readFileSync(new URL("../../schema/actions.json", import.meta.url), "utf-8")) as {
	actions: { action_name: string; category: string }[];
};
const actorActions = snapshot.actions.filter((a) => a.category === "player" || a.category === "player_emotes");

describe("libellés", () => {
	test("libellé connu en français et en anglais", () => {
		expect(labelFor("emote_dance", "fr")).toBe("Danser");
		expect(labelFor("emote_dance", "en")).toBe("Dance");
		expect(labelFor("toggle_flashlight", "fr")).toBe("Torche");
	});

	test("action inconnue : libellé tiré du nom", () => {
		expect(labelFor("emote_new_thing", "fr")).toBe("New thing");
	});

	test("humanize retire les préfixes v_ et emote_", () => {
		expect(humanize("v_starmap")).toBe("Starmap");
		expect(humanize("emote_new_thing")).toBe("New thing");
		expect(humanize("visor_wipe")).toBe("Visor wipe");
	});

	test("libellés des groupes", () => {
		expect(groupLabel("player", "fr")).toBe("Personnage");
		expect(groupLabel("player_emotes", "fr")).toBe("Émotes");
		expect(groupLabel("player", "en")).toBe("Character");
		expect(groupLabel("spaceship_unknown", "fr")).toBe("Spaceship unknown");
	});

	test("langue : français si le logiciel est en français, anglais sinon", () => {
		expect(toLang("fr")).toBe("fr");
		expect(toLang("fr_CA")).toBe("fr");
		expect(toLang("de")).toBe("en");
		expect(toLang("en")).toBe("en");
	});

	test("chaque action player/player_emotes de l'instantané a un libellé fr et en", () => {
		expect(actorActions.length).toBe(38);
		const missing = actorActions.map((a) => a.action_name).filter((n) => !(n in fr.actions && n in en.actions));
		expect(missing).toEqual([]);
	});
});
