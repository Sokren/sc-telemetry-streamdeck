import { describe, expect, test } from "vitest";
import { DISPLAY_VALUES, isDisplayValueId, readValue } from "../../src/display/values.js";

/** Section `actor` observée dans le vrai flux (2026-11-20, perso à pied). */
const observed = {
	vitals: {
		health: { current: 100, max: 100 },
		oxygen: { current: 1, max: 1 },
		hunger: { current: 78.16663, max: 100 },
		thirst: { current: 47.255905, max: 100 },
		body_temperature: { current: 36.5, max: 100 },
		heart_rate: 60.735912,
		gravity: 1.0003417,
		pressure: 1,
	},
	state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT", uec_balance: "15001986" },
	environment: { external_temperature: 20.999994, breathable_atmosphere: true },
};

describe("liste des données", () => {
	test("13 données dans l'ordre de la conception", () => {
		expect(DISPLAY_VALUES).toEqual([
			"health", "oxygen", "hunger", "thirst", "body_temperature", "external_temperature",
			"heart_rate", "gravity", "pressure", "radiation", "intoxication", "breathable", "balance",
		]);
		expect(isDisplayValueId("oxygen")).toBe(true);
		expect(isDisplayValueId("v_self_destruct")).toBe(false);
		expect(isDisplayValueId(undefined)).toBe(false);
	});
});

describe("readValue sur la frame observée", () => {
	test("section actor absente ou périmée → indisponible", () => {
		for (const id of DISPLAY_VALUES) expect(readValue(id, undefined)).toEqual({ available: false });
	});

	test("jauges en %", () => {
		expect(readValue("health", observed)).toEqual({ available: true, kind: "percent", percent: 100, level: "ok" });
		expect(readValue("oxygen", observed)).toEqual({ available: true, kind: "percent", percent: 100, level: "ok" });
		expect(readValue("hunger", observed)).toMatchObject({ percent: expect.closeTo(78.17, 1), level: "ok" });
		expect(readValue("thirst", observed)).toMatchObject({ percent: expect.closeTo(47.26, 1), level: "warn" });
	});

	test("température corporelle : valeur, barre sur 30–42 °C, niveau", () => {
		const r = readValue("body_temperature", observed);
		expect(r).toMatchObject({ available: true, kind: "number", value: 36.5, level: "ok" });
		expect((r as { bar: number }).bar).toBeCloseTo(54.17, 1);
	});

	test("valeurs simples sans couleur", () => {
		expect(readValue("external_temperature", observed)).toMatchObject({ kind: "number", value: expect.closeTo(21, 2), level: "none" });
		expect(readValue("heart_rate", observed)).toMatchObject({ kind: "number", value: expect.closeTo(60.74, 2), level: "none" });
		expect(readValue("gravity", observed)).toMatchObject({ kind: "number", value: expect.closeTo(1.0003, 3) });
		expect(readValue("pressure", observed)).toMatchObject({ kind: "number", value: 1 });
		expect(readValue("heart_rate", observed)).not.toHaveProperty("bar");
	});

	test("atmosphère respirable et solde", () => {
		expect(readValue("breathable", observed)).toEqual({ available: true, kind: "bool", value: true });
		expect(readValue("balance", observed)).toEqual({ available: true, kind: "money", value: "15001986" });
	});
});

describe("champs absents dans une section fraîche (proto3)", () => {
	test("rayonnement, intoxication non transmis → 0", () => {
		expect(readValue("radiation", observed)).toMatchObject({ available: true, value: 0 });
		expect(readValue("intoxication", observed)).toMatchObject({ available: true, value: 0 });
	});

	test("faim à 0 (current non transmis, max présent) → 0 %, rouge", () => {
		const actor = { vitals: { hunger: { max: 100 } } };
		expect(readValue("hunger", actor)).toEqual({ available: true, kind: "percent", percent: 0, level: "bad" });
	});

	test("jauge entièrement absente ou sans max → indisponible", () => {
		expect(readValue("hunger", { vitals: {} })).toEqual({ available: false });
		expect(readValue("hunger", { vitals: { hunger: { current: 5 } } })).toEqual({ available: false });
		expect(readValue("oxygen", {})).toEqual({ available: false });
	});

	test("atmosphère non respirable (false non transmis) → false ; solde absent → 0", () => {
		expect(readValue("breathable", { environment: {} })).toEqual({ available: true, kind: "bool", value: false });
		expect(readValue("balance", { state: {} })).toEqual({ available: true, kind: "money", value: "0" });
	});
});

describe("bornes et seuils", () => {
	const gauge = (current: number, max = 100) => readValue("health", { vitals: { health: { current, max } } });

	test("pourcentage borné à 0–100", () => {
		expect(gauge(120)).toMatchObject({ percent: 100 });
		expect(gauge(-1)).toMatchObject({ percent: 0 });
	});

	test("seuils des jauges : ≥ 50 vert, 25–50 orange, < 25 rouge", () => {
		expect(gauge(50)).toMatchObject({ level: "ok" });
		expect(gauge(49.9)).toMatchObject({ level: "warn" });
		expect(gauge(25)).toMatchObject({ level: "warn" });
		expect(gauge(24.9)).toMatchObject({ level: "bad" });
	});

	test("seuils de température corporelle", () => {
		const body = (c: number) => readValue("body_temperature", { vitals: { body_temperature: { current: c, max: 100 } } });
		expect(body(35)).toMatchObject({ level: "ok" });
		expect(body(38)).toMatchObject({ level: "ok" });
		expect(body(34.9)).toMatchObject({ level: "warn" });
		expect(body(38.5)).toMatchObject({ level: "warn" });
		expect(body(34)).toMatchObject({ level: "warn" });
		expect(body(39)).toMatchObject({ level: "warn" });
		expect(body(33.9)).toMatchObject({ level: "bad" });
		expect(body(39.1)).toMatchObject({ level: "bad" });
	});

	test("barre de température bornée à l'échelle 30–42 °C", () => {
		const bar = (c: number) => (readValue("body_temperature", { vitals: { body_temperature: { current: c } } }) as { bar: number }).bar;
		expect(bar(25)).toBe(0);
		expect(bar(45)).toBe(100);
	});

	test("température corporelle à 0 (non transmise) dans une section fraîche → 0 °C, rouge", () => {
		expect(readValue("body_temperature", { vitals: { body_temperature: { max: 100 } } })).toMatchObject({ value: 0, level: "bad" });
	});
});
