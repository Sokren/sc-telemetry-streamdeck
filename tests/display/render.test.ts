import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { COLORS, type DisplayView } from "../../src/display/format.js";
import { renderKeySvg, toFeedback } from "../../src/display/render.js";

const oxygen: DisplayView = { short: "O₂", long: "Oxygène", text: "100", unit: "%", bar: 100, color: COLORS.ok };
const heart: DisplayView = { short: "Cœur", long: "Rythme cardiaque", text: "61", unit: "bpm", color: COLORS.none };
const svgOf = (uri: string) => {
	expect(uri.startsWith("data:image/svg+xml;charset=utf8,")).toBe(true);
	return decodeURIComponent(uri.slice("data:image/svg+xml;charset=utf8,".length));
};

describe("renderKeySvg", () => {
	test("image 144×144 avec libellé, valeur, unité et barre colorée", () => {
		const svg = svgOf(renderKeySvg(oxygen));
		expect(svg).toContain('viewBox="0 0 144 144"');
		expect(svg).toContain(">O₂<");
		expect(svg).toContain(">100<");
		expect(svg).toContain(">%<");
		expect(svg).toContain(`fill="${COLORS.ok}"`);
	});

	test("sans barre pour une donnée sans jauge", () => {
		expect(svgOf(renderKeySvg(heart))).not.toContain(`fill="${COLORS.none}"`);
	});

	test("barre vide (indisponible) : fond seulement", () => {
		const svg = svgOf(renderKeySvg({ ...oxygen, text: "—", unit: "", bar: 0, color: COLORS.none }));
		expect(svg).toContain(">—<");
		expect(svg).not.toContain(`fill="${COLORS.none}"`);
	});

	test("texte échappé", () => {
		const svg = svgOf(renderKeySvg({ ...heart, short: "<a&b>" }));
		expect(svg).toContain("&lt;a&amp;b&gt;");
		expect(svg).not.toContain("<a&b>");
	});

	test("même vue → même image (permet d'éviter les renvois)", () => {
		expect(renderKeySvg(oxygen)).toBe(renderKeySvg({ ...oxygen }));
	});
});

describe("toFeedback", () => {
	test("libellé long, valeur + unité, barre colorée", () => {
		expect(toFeedback(oxygen)).toEqual({ label: "Oxygène", value: "100 %", indicator: { value: 100, bar_fill_c: COLORS.ok } });
	});

	test("donnée sans jauge : barre vide grise (efface la barre précédente)", () => {
		expect(toFeedback(heart)).toEqual({ label: "Rythme cardiaque", value: "61 bpm", indicator: { value: 0, bar_fill_c: COLORS.none } });
	});

	test("sans unité : valeur seule", () => {
		expect(toFeedback({ ...heart, unit: "", text: "—" })).toMatchObject({ value: "—" });
	});
});

describe("mise en page de la molette", () => {
	const layout = JSON.parse(
		fs.readFileSync(new URL("../../com.sokren.sc-telemetry.sdPlugin/layouts/actor-display.json", import.meta.url), "utf-8"),
	) as { items: { key: string }[] };
	const keys = layout.items.map((i) => i.key);

	test("chaque clé envoyée existe dans la mise en page", () => {
		for (const k of Object.keys(toFeedback(oxygen))) expect(keys).toContain(k);
	});

	test("pas de clé « title » : réservée au titre de l'action, masqué par le manifeste", () => {
		expect(keys).not.toContain("title");
		expect(Object.keys(toFeedback(oxygen))).not.toContain("title");
	});
});
