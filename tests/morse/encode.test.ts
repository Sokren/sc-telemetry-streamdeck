import { describe, expect, test } from "vitest";
import { normalizeText, toToggleTimes } from "../../src/morse/encode.js";

describe("normalizeText", () => {
	test("majuscules, espaces réduits et rognés", () => {
		expect(normalizeText("  a  b ")).toBe("A B");
	});
	test("accents retirés", () => {
		expect(normalizeText("été")).toBe("ETE");
		expect(normalizeText("Ça")).toBe("CA");
	});
	test("caractères non gérés retirés", () => {
		expect(normalizeText("S.O.S !")).toBe("SOS");
		expect(normalizeText("?!")).toBe("");
	});
});

describe("toToggleTimes", () => {
	test("SOS, unité 100 ms", () => {
		expect(toToggleTimes("SOS", 100, 1)).toEqual([
			0, 100, 200, 300, 400, 500, // S
			800, 1100, 1200, 1500, 1600, 1900, // O
			2200, 2300, 2400, 2500, 2600, 2700, // S
		]);
	});
	test("7 unités entre deux mots", () => {
		expect(toToggleTimes("E E", 100, 1)).toEqual([0, 100, 800, 900]);
	});
	test("7 unités entre deux répétitions", () => {
		expect(toToggleTimes("E", 100, 2)).toEqual([0, 100, 800, 900]);
	});
	test("texte normalisé avant encodage", () => {
		expect(toToggleTimes("é", 100, 1)).toEqual([0, 100]);
	});
	test("rien à émettre → []", () => {
		expect(toToggleTimes("?!", 100, 1)).toEqual([]);
		expect(toToggleTimes("", 100, 3)).toEqual([]);
	});
});
