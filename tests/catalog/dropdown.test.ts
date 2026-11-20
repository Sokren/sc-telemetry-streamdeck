import { describe, expect, test } from "vitest";
import { ACTOR_GROUPS, buildDropdown, type DataSourceItem } from "../../src/catalog/dropdown.js";
import type { GameAction } from "../../src/game/types.js";

const a = (name: string, category: string): GameAction => ({ name, category, holdable: false });
const actions = [
	a("emote_wave", "player_emotes"),
	a("emote_dance", "player_emotes"),
	a("mobiglas", "player"),
	a("toggle_flashlight", "player"),
	a("v_self_destruct", "spaceship_general"),
	a("v_eject", "seat_general"),
];
type Group = { label: string; children: { label: string; value: string }[] };
const values = (items: DataSourceItem[]) => JSON.stringify(items);

describe("buildDropdown", () => {
	test("deux groupes, Personnage puis Émotes", () => {
		const items = buildDropdown(actions, ACTOR_GROUPS, "fr");
		expect(items.map((g) => g.label)).toEqual(["Personnage", "Émotes"]);
	});

	test("les actions d'autres catégories ne sont jamais proposées", () => {
		const json = values(buildDropdown(actions, ACTOR_GROUPS, "fr"));
		expect(json).not.toContain("v_self_destruct");
		expect(json).not.toContain("v_eject");
	});

	test("actions triées par libellé dans chaque groupe, value = nom technique", () => {
		const [, emotes] = buildDropdown(actions, ACTOR_GROUPS, "fr") as Group[];
		expect(emotes.children).toEqual([
			{ label: "Danser", value: "emote_dance" },
			{ label: "Faire coucou", value: "emote_wave" },
		]);
	});

	test("groupe vide omis", () => {
		const items = buildDropdown([a("emote_wave", "player_emotes")], ACTOR_GROUPS, "fr");
		expect(items.map((g) => g.label)).toEqual(["Émotes"]);
	});

	test("action enregistrée absente → en tête, marquée indisponible, valeur conservée", () => {
		const items = buildDropdown(actions, ACTOR_GROUPS, "fr", "emote_retired");
		expect(items[0]).toEqual({ label: "Retired (indisponible)", value: "emote_retired" });
		expect(items.slice(1).map((g) => g.label)).toEqual(["Personnage", "Émotes"]);
	});

	test("action enregistrée d'une autre catégorie → aussi marquée indisponible", () => {
		const items = buildDropdown(actions, ACTOR_GROUPS, "en", "v_self_destruct");
		expect(items[0]).toEqual({ label: "Self destruct (unavailable)", value: "v_self_destruct" });
	});

	test("action enregistrée présente → aucun ajout", () => {
		const items = buildDropdown(actions, ACTOR_GROUPS, "fr", "emote_wave");
		expect(items.map((g) => g.label)).toEqual(["Personnage", "Émotes"]);
	});
});
