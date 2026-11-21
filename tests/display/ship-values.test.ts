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
		expect(SHIP_DISPLAY_VALUES).toEqual(["countermeasures", "decoys", "noise"]);
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
		for (const id of SHIP_DISPLAY_VALUES) expect(shipView(id, {}, t, "en")).toMatchObject({ text: "—", unit: "", bar: 0, color: COLORS.none });
		expect(shipView("countermeasures", { weapons: { countermeasures: [] }, actor: SEATED }, t, "fr").text).toBe("—");
	});

	test("libellés longs FR / EN", () => {
		const t = new CountermeasureTracker();
		expect(shipView("countermeasures", {}, t, "fr").long).toBe("Contre-mesures (leurres / brouilleurs)");
		expect(shipView("countermeasures", {}, t, "en").long).toBe("Countermeasures (decoys / noise)");
	});
});
