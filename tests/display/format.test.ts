import { describe, expect, test } from "vitest";
import en from "../../src/display/labels.en.json" with { type: "json" };
import fr from "../../src/display/labels.fr.json" with { type: "json" };
import { COLORS, toView } from "../../src/display/format.js";
import { DISPLAY_VALUES, readValue } from "../../src/display/values.js";

const observed = {
	vitals: {
		health: { current: 100, max: 100 },
		oxygen: { current: 1, max: 1 },
		thirst: { current: 47.255905, max: 100 },
		body_temperature: { current: 36.5, max: 100 },
		heart_rate: 60.735912,
		gravity: 1.0003417,
		pressure: 1,
	},
	state: { uec_balance: "15001986" },
	environment: { external_temperature: 20.999994, breathable_atmosphere: true },
};
/** `actor` à `null` = section absente ou périmée. */
const view = (id: Parameters<typeof readValue>[0], lang: "fr" | "en", actor: object | null = observed) =>
	toView(id, readValue(id, (actor ?? undefined) as Record<string, unknown> | undefined), lang);

describe("libellés", () => {
	test("chaque donnée a un libellé court (≤ 6) et long, en français et en anglais", () => {
		for (const table of [fr, en]) {
			for (const id of DISPLAY_VALUES) {
				const l = (table.values as Record<string, { short: string; long: string }>)[id];
				expect(l, id).toBeDefined();
				expect([...l.short].length, `${id} : ${l.short}`).toBeLessThanOrEqual(6);
				expect(l.long.length).toBeGreaterThan(0);
			}
		}
	});
});

describe("toView", () => {
	test("jauge en % : texte entier, unité, barre, couleur", () => {
		expect(view("oxygen", "fr")).toEqual({ short: "O₂", long: "Oxygène", text: "100", unit: "%", bar: 100, color: COLORS.ok });
		expect(view("thirst", "en")).toMatchObject({ short: "Thirst", text: "47", unit: "%", bar: expect.closeTo(47.26, 1), color: COLORS.warn });
	});

	test("température corporelle : 1 décimale, virgule en français", () => {
		expect(view("body_temperature", "fr")).toMatchObject({ text: "36,5", unit: "°C", color: COLORS.ok });
		expect(view("body_temperature", "en")).toMatchObject({ text: "36.5", unit: "°C" });
	});

	test("valeurs simples : arrondis et unités", () => {
		expect(view("external_temperature", "fr")).toMatchObject({ text: "21", unit: "°C", color: COLORS.none });
		expect(view("external_temperature", "fr")).not.toHaveProperty("bar");
		expect(view("heart_rate", "en")).toMatchObject({ text: "61", unit: "bpm" });
		expect(view("gravity", "fr")).toMatchObject({ text: "1,00", unit: "g" });
		expect(view("pressure", "en")).toMatchObject({ text: "1.00", unit: "" });
		expect(view("intoxication", "fr")).toMatchObject({ text: "0", unit: "" });
	});

	test("atmosphère respirable : Oui / Yes", () => {
		expect(view("breathable", "fr")).toMatchObject({ text: "Oui" });
		expect(view("breathable", "en")).toMatchObject({ text: "Yes" });
		expect(view("breathable", "fr", { environment: {} })).toMatchObject({ text: "Non" });
	});

	test("solde compact", () => {
		expect(view("balance", "fr")).toMatchObject({ text: "15,0 M", unit: "aUEC" });
		expect(view("balance", "en")).toMatchObject({ text: "15.0M", unit: "aUEC" });
		const money = (v: string, lang: "fr" | "en") => view("balance", lang, { state: { uec_balance: v } }).text;
		expect(money("999", "fr")).toBe("999");
		expect(money("12345", "fr")).toBe("12,3 k");
		expect(money("123456", "en")).toBe("123k");
		expect(money("1234567890", "fr")).toBe("1,2 Md");
		expect(money("1234567890", "en")).toBe("1.2B");
	});

	test("indisponible → « — », gris ; barre vide seulement pour les jauges", () => {
		expect(view("oxygen", "fr", null)).toEqual({ short: "O₂", long: "Oxygène", text: "—", unit: "", bar: 0, color: COLORS.none });
		expect(view("body_temperature", "fr", null)).toMatchObject({ text: "—", bar: 0 });
		expect(view("heart_rate", "fr", null)).not.toHaveProperty("bar");
	});
});
