import { describe, expect, test } from "vitest";
import { CountermeasureTracker } from "../../src/display/countermeasures.js";
import { COLORS } from "../../src/display/format.js";
import { isShipDisplayValueId, SHIP_DISPLAY_VALUES, shipView } from "../../src/display/ship-values.js";

const SEATED = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const vehicle = { state: { class_name: "MISC_Prospector" } };
const cm = (decoy?: number, noise?: number) => ({
	weapons: {
		countermeasures: [
			...(decoy === undefined ? [] : [{ type: "COUNTERMEASURE_TYPE_DECOY", amount: decoy }]),
			...(noise === undefined ? [] : [{ type: "COUNTERMEASURE_TYPE_NOISE", amount: noise }]),
		],
	},
	vehicle,
	actor: SEATED,
});

describe("shipView", () => {
	test("liste des valeurs : contre-mesures, leurres, brouilleurs", () => {
		expect(SHIP_DISPLAY_VALUES).toEqual(["countermeasures", "decoys", "noise", "weapons", "weapon_group", "gimbals"]);
		expect(isShipDisplayValueId("decoys")).toBe(true);
		expect(isShipDisplayValueId("oxygen")).toBe(false);
	});

	test("les deux : « 45 / 3 », barre et couleur du plus bas pourcentage", () => {
		const t = new CountermeasureTracker();
		t.observe(cm(48, 5));
		const v = shipView("countermeasures", cm(45, 1), t, "fr");
		expect(v).toMatchObject({ short: "C-mesures", text: "45 / 1", unit: "", bar: 20, color: COLORS.bad });
	});

	test("leurres seuls, brouilleurs seuls", () => {
		const t = new CountermeasureTracker();
		t.observe(cm(48, 5));
		expect(shipView("decoys", cm(24, 5), t, "en")).toMatchObject({ short: "Decoys", long: "Decoys", text: "24", bar: 50, color: COLORS.ok });
		expect(shipView("noise", cm(24, 2), t, "fr")).toMatchObject({ short: "Brouill.", text: "2", bar: 40, color: COLORS.warn });
	});

	test("un seul type sur le vaisseau : « contre-mesures » n'affiche que lui", () => {
		const t = new CountermeasureTracker();
		expect(shipView("countermeasures", cm(24), t, "fr")).toMatchObject({ short: "Leurres", long: "Leurres", text: "24", bar: 100, color: COLORS.ok });
		expect(shipView("countermeasures", cm(undefined, 3), t, "en")).toMatchObject({ short: "Noise", text: "3" });
		expect(shipView("noise", cm(24), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
	});

	test("rien de lisible (jeu fermé, à pied) → « — », barre vide", () => {
		const t = new CountermeasureTracker();
		for (const id of ["countermeasures", "decoys", "noise", "weapons"] as const) expect(shipView(id, {}, t, "en")).toMatchObject({ text: "—", unit: "", bar: 0, color: COLORS.none });
		expect(shipView("countermeasures", { weapons: { countermeasures: [] }, actor: SEATED }, t, "fr").text).toBe("—");
	});

	test("libellés longs FR / EN", () => {
		const t = new CountermeasureTracker();
		expect(shipView("countermeasures", {}, t, "fr").long).toBe("Contre-mesures (leurres / brouilleurs)");
		expect(shipView("countermeasures", {}, t, "en").long).toBe("Countermeasures (decoys / noise)");
	});

	describe("armes", () => {
		const gun = (ready: boolean) => ({ name: "KLWE_LaserRepeater_S1_1", is_powered: true, ...(ready ? { ready_to_fire: true } : {}) });
		const at = (weapons: Record<string, unknown>) => ({ weapons, vehicle, actor: SEATED });
		const t = new CountermeasureTracker();

		test("armes prêtes : « 1 / 2 », barre 50 %, orange ; « 2 / 2 » vert ; sans arme « — »", () => {
			expect(shipView("weapons", at({ weapons: [gun(true), gun(false)] }), t, "fr")).toMatchObject({ short: "Armes", text: "1 / 2", bar: 50, color: COLORS.warn });
			expect(shipView("weapons", at({ weapons: [gun(true), gun(true)] }), t, "en")).toMatchObject({ short: "Weapons", text: "2 / 2", bar: 100, color: COLORS.ok });
			expect(shipView("weapons", at({}), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
		});

		test("groupe : nom, sinon numéro à partir de 1, sans jauge", () => {
			const named = shipView("weapon_group", at({ preset_index: 2, preset_name: "Missiles", weapons: [gun(true)] }), t, "fr");
			expect(named).toMatchObject({ short: "Groupe", text: "Missiles" });
			expect(named.bar).toBeUndefined();
			// Groupe 0 = « tous » dans le jeu, puis 1, 2… (confirmé par Remi en jeu).
			expect(shipView("weapon_group", at({ weapons: [gun(true)] }), t, "en")).toMatchObject({ short: "Group", text: "All" });
			expect(shipView("weapon_group", at({ weapons: [gun(true)] }), t, "fr").text).toBe("Toutes");
			expect(shipView("weapon_group", at({ preset_index: 1, weapons: [gun(true)] }), t, "fr").text).toBe("1");
			expect(shipView("weapon_group", at({ preset_index: 3, weapons: [gun(true)] }), t, "en").text).toBe("3");
		});

		test("cardans : fixes / libres, sans jauge", () => {
			const armed = (locked: boolean) => at({ ...(locked ? { settings: { gimbals_locked: true } } : {}), weapons: [gun(true)] });
			expect(shipView("gimbals", armed(true), t, "fr")).toMatchObject({ short: "Cardans", text: "Fixes" });
			expect(shipView("gimbals", armed(false), t, "fr").text).toBe("Libres");
			expect(shipView("gimbals", armed(true), t, "en").text).toBe("Locked");
			expect(shipView("gimbals", armed(false), t, "en")).toMatchObject({ short: "Gimbals", text: "Free" });
			expect(shipView("gimbals", {}, t, "fr")).toMatchObject({ text: "—" });
			expect(shipView("gimbals", {}, t, "fr").bar).toBeUndefined();
		});
	});

	test("vaisseau sans arme (siège passager…) : groupe et cardans « — » aussi ; nom de groupe long raccourci", () => {
		const t = new CountermeasureTracker();
		const at = (weapons: Record<string, unknown>) => ({ weapons, vehicle, actor: SEATED });
		expect(shipView("weapon_group", at({ settings: { gimbals_locked: true } }), t, "fr").text).toBe("—");
		expect(shipView("gimbals", at({ settings: { gimbals_locked: true } }), t, "fr").text).toBe("—");
		const gun = { name: "x", ready_to_fire: true };
		expect(shipView("weapon_group", at({ preset_name: "Missiles anti-vaisseaux", weapons: [gun] }), t, "fr").text).toBe("Missiles…");
		expect(shipView("weapon_group", at({ preset_name: "Missiles", weapons: [gun] }), t, "fr").text).toBe("Missiles");
	});
});
