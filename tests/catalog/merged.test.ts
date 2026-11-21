import { describe, expect, test } from "vitest";
import { SHIP_GROUPS, buildDropdown, type DataSourceItem } from "../../src/catalog/dropdown.js";
import { MERGED_COMMANDS, commandFor, mergedFor } from "../../src/catalog/merged.js";
import { readSnapshot } from "../../src/catalog/source.js";
import { DANGEROUS_ACTIONS } from "../../src/game/dangerous.js";

const snapshot = readSnapshot(new URL("../../schema/actions.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const flat = (items: DataSourceItem[]): { label: string; value: string }[] =>
	items.flatMap((i) => ("children" in i ? flat(i.children) : [i as { label: string; value: string }]));

describe("commandes regroupées", () => {
	test("13 regroupements on / off / bascule, sans commande dangereuse", () => {
		expect(MERGED_COMMANDS.map((g) => g.fn)).toEqual([
			"gear", "lights", "vtol", "transform", "decoupled", "gsafe", "proximity", "advanced_hud",
			"night_vision", "master_nav", "power_engines", "power_weapons", "power_shields",
		]);
		for (const g of MERGED_COMMANDS) for (const c of [g.on, g.off, g.toggle]) expect(DANGEROUS_ACTIONS.has(c)).toBe(false);
	});

	test("commande selon le mode (bascule par défaut)", () => {
		const lights = MERGED_COMMANDS.find((g) => g.fn === "lights")!;
		expect(lights.id).toBe("group:lights");
		expect(commandFor(lights, "on")).toBe("v_lights_on");
		expect(commandFor(lights, "off")).toBe("v_lights_off");
		expect(commandFor(lights, "toggle")).toBe("v_lights");
		expect(commandFor(lights, undefined)).toBe("v_lights");
		expect(commandFor(lights, "n'importe quoi" as never)).toBe("v_lights");
	});

	test("ancienne commande enregistrée → regroupement et mode (pour convertir les touches existantes)", () => {
		expect(mergedFor("v_lights_on")).toEqual({ group: "group:lights", mode: "on" });
		expect(mergedFor("v_retract_landing_system")).toEqual({ group: "group:gear", mode: "off" });
		expect(mergedFor("v_master_mode_cycle")).toEqual({ group: "group:master_nav", mode: "toggle" });
		expect(mergedFor("v_flightready")).toBeUndefined();
	});
});

describe("liste de Ship Action avec regroupements", () => {
	const items = buildDropdown(snapshot, SHIP_GROUPS, "fr", undefined, MERGED_COMMANDS);
	const values = flat(items).map((i) => i.value);

	test("une ligne par regroupement, plus de lignes on / off / bascule séparées", () => {
		expect(values).toContain("group:lights");
		for (const c of ["v_lights", "v_lights_on", "v_lights_off", "v_deploy_landing_system", "v_power_set_shields_on"]) expect(values).not.toContain(c);
		expect(flat(items).find((i) => i.value === "group:lights")?.label).toBe("Phares");
	});

	test("chaque regroupement dans le groupe de ses commandes ; commandes uniques gardées", () => {
		const group = (v: string) => (items as { label: string; children: { value: string }[] }[]).find((g) => g.children.some((c) => c.value === v))?.label;
		expect(group("group:lights")).toBe("Phares");
		expect(group("group:gear")).toBe("Vol");
		expect(group("group:power_shields")).toBe("Puissance");
		expect(group("group:night_vision")).toBe("Siège");
		expect(values).toContain("v_flightready");
		expect(values).toContain("v_ifcs_toggle_esp");
		expect(values).toContain("v_power_set_on");
	});

	test("liste bien plus courte, toujours sans action dangereuse", () => {
		const unmerged = flat(buildDropdown(snapshot, SHIP_GROUPS, "fr")).length;
		expect(values.length).toBe(unmerged - 13 * 2);
		for (const d of DANGEROUS_ACTIONS) expect(values).not.toContain(d);
	});

	test("regroupement enregistré retrouvé (pas « indisponible »)", () => {
		const withSel = buildDropdown(snapshot, SHIP_GROUPS, "fr", "group:gear", MERGED_COMMANDS);
		expect(flat(withSel).filter((i) => i.value === "group:gear")).toHaveLength(1);
		expect(flat(withSel).some((i) => i.label.includes("indisponible"))).toBe(false);
	});

	test("regroupement dont le jeu ne propose qu'une commande → pas fusionné", () => {
		const few = snapshot.filter((a) => a.name !== "v_lights_on" && a.name !== "v_lights_off");
		const v = flat(buildDropdown(few, SHIP_GROUPS, "fr", undefined, MERGED_COMMANDS)).map((i) => i.value);
		expect(v).toContain("v_lights");
		expect(v).not.toContain("group:lights");
	});
});
