import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { ACTOR_GROUPS, SHIP_GROUPS, buildDropdown, type DataSourceItem } from "../../src/catalog/dropdown.js";
import en from "../../src/catalog/labels.en.json" with { type: "json" };
import fr from "../../src/catalog/labels.fr.json" with { type: "json" };
import { readSnapshot } from "../../src/catalog/source.js";
import { DANGEROUS_ACTIONS } from "../../src/game/dangerous.js";

const snapshot = readSnapshot(new URL("../../schema/actions.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shipCategories = SHIP_GROUPS.map((g) => g.category);
const values = (items: DataSourceItem[]): string[] =>
	items.flatMap((i) => ("children" in i ? values(i.children) : [i.value]));

describe("groupes de Ship Action", () => {
	test("9 groupes dans l'ordre de la spec", () => {
		expect(shipCategories).toEqual([
			"spaceship_general", "spaceship_movement", "spaceship_power", "spaceship_quantum", "spaceship_radar",
			"spaceship_target_hailing", "spaceship_docking", "seat_general", "lights_controller",
		]);
	});

	test("libellés des groupes en français et en anglais", () => {
		const items = buildDropdown(snapshot, SHIP_GROUPS, "fr");
		expect(items.map((g) => g.label)).toEqual(["Vaisseau", "Vol", "Puissance", "Quantum", "Radar", "Communication", "Amarrage", "Siège", "Phares"]);
		expect(buildDropdown(snapshot, SHIP_GROUPS, "en")[0].label).toBe("Ship");
	});

	test("aucune action dangereuse proposée", () => {
		const offered = values(buildDropdown(snapshot, SHIP_GROUPS, "fr"));
		expect(offered.length).toBeGreaterThan(40);
		for (const name of DANGEROUS_ACTIONS) expect(offered).not.toContain(name);
	});

	test("une action dangereuse enregistrée apparaît seulement comme « (indisponible) »", () => {
		const items = buildDropdown(snapshot, SHIP_GROUPS, "fr", "v_self_destruct");
		expect(items[0]).toMatchObject({ value: "v_self_destruct" });
		expect((items[0] as { label: string }).label).toContain("(indisponible)");
		expect(values(items.slice(1))).not.toContain("v_self_destruct");
	});

	test("chaque action non dangereuse de ces catégories a un libellé fr et en", () => {
		const names = snapshot.filter((a) => shipCategories.includes(a.category) && !DANGEROUS_ACTIONS.has(a.name)).map((a) => a.name);
		const missing = names.filter((n) => !(n in fr.actions && n in en.actions));
		expect(missing).toEqual([]);
	});

	test("Actor Action inchangé", () => {
		expect(buildDropdown(snapshot, ACTOR_GROUPS, "fr").map((g) => g.label)).toEqual(["Personnage", "Émotes"]);
	});
});
