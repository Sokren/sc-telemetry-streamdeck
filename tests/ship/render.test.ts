import { describe, expect, test } from "vitest";
import { SHIP_FUNCTION_IDS } from "../../src/ship/functions.js";
import en from "../../src/ship/labels.en.json" with { type: "json" };
import fr from "../../src/ship/labels.fr.json" with { type: "json" };
import { SHIP_COLORS, renderShipKey, shipFunctionName, toShipView, type ShipView } from "../../src/ship/render.js";

const svgOf = (uri: string) => {
	expect(uri.startsWith("data:image/svg+xml;charset=utf8,")).toBe(true);
	return decodeURIComponent(uri.slice("data:image/svg+xml;charset=utf8,".length));
};

describe("libellés", () => {
	test("chaque fonction a nom, libellé court (≤ 12) et mots on/off, en français et en anglais", () => {
		for (const table of [fr, en]) {
			for (const id of SHIP_FUNCTION_IDS) {
				const l = (table.functions as Record<string, { name: string; label: string; on: string; off: string }>)[id];
				expect(l, id).toBeDefined();
				expect(l.name.length).toBeGreaterThan(0);
				expect([...l.label].length, `${id} : ${l.label}`).toBeLessThanOrEqual(12);
				expect(l.on.length * l.off.length).toBeGreaterThan(0);
			}
		}
	});

	test("nom complet pour la liste du panneau", () => {
		expect(shipFunctionName("doors_locked", "fr")).toBe("Portes verrouillées");
		expect(shipFunctionName("gear", "en")).toBe("Landing gear");
	});
});

describe("toShipView", () => {
	test("mots d'état selon la fonction et la langue", () => {
		expect(toShipView("gear", "on", "fr")).toEqual({ id: "gear", label: "Train", word: "SORTI", tone: "on" });
		expect(toShipView("gear", "off", "en")).toMatchObject({ word: "UP", tone: "off" });
		expect(toShipView("master_nav", "off", "fr")).toMatchObject({ word: "SCM", tone: "off" });
		expect(toShipView("decoupled", "off", "en")).toMatchObject({ word: "COUPLED" });
		expect(toShipView("lights", "on", "fr")).toMatchObject({ word: "ON", tone: "on" });
	});

	test("en mouvement → « … » ; indisponible ou inconnu → « — »", () => {
		expect(toShipView("gear", "moving-on", "fr")).toMatchObject({ word: "…", tone: "moving" });
		expect(toShipView("gear", "moving-off", "fr")).toMatchObject({ word: "…", tone: "moving" });
		expect(toShipView("gear", "unknown", "fr")).toMatchObject({ word: "—", tone: "none" });
		expect(toShipView("transform", "unavailable", "en")).toMatchObject({ word: "—", tone: "none" });
	});
});

describe("renderShipKey", () => {
	const on: ShipView = { id: "gear", label: "Train", word: "SORTI", tone: "on" };
	const moving: ShipView = { ...on, word: "…", tone: "moving" };
	const none: ShipView = { ...on, word: "—", tone: "none" };

	test("style A (texte) : libellé et mot d'état dans sa couleur", () => {
		const svg = svgOf(renderShipKey(on, "text"));
		expect(svg).toContain('viewBox="0 0 144 144"');
		expect(svg).toContain(">Train<");
		expect(svg).toContain(">SORTI<");
		expect(svg).toContain(`fill="${SHIP_COLORS.on}"`);
	});

	test("style B (voyant) : cercle de la couleur de l'état", () => {
		const svg = svgOf(renderShipKey(moving, "led"));
		expect(svg).toMatch(new RegExp(`<circle[^>]*fill="${SHIP_COLORS.moving}"`));
		expect(svg).toContain(">Train<");
	});

	test("style C (fond) : fond vert si on, orange si en mouvement, sombre sinon", () => {
		expect(svgOf(renderShipKey(on, "fill"))).toContain(`fill="${SHIP_COLORS.onFill}"`);
		expect(svgOf(renderShipKey(moving, "fill"))).toContain(`fill="${SHIP_COLORS.movingFill}"`);
		const off = svgOf(renderShipKey({ ...on, word: "RENTRÉ", tone: "off" }, "fill"));
		expect(off).toContain(`fill="${SHIP_COLORS.background}"`);
		expect(off).not.toContain(SHIP_COLORS.onFill);
	});

	test("indisponible : aucune couleur on / en mouvement, quel que soit le style", () => {
		for (const style of ["text", "led", "fill"] as const) {
			const svg = svgOf(renderShipKey(none, style));
			for (const c of [SHIP_COLORS.on, SHIP_COLORS.moving, SHIP_COLORS.onFill, SHIP_COLORS.movingFill]) expect(svg).not.toContain(c);
		}
	});

	test("« — » visible dans les trois styles quand l'état est inconnu", () => {
		for (const style of ["text", "led", "fill"] as const) expect(svgOf(renderShipKey(none, style)), style).toContain(">—<");
	});

	test("style B : voyant éteint gris visible (distinct de « pas de données »)", () => {
		const svg = svgOf(renderShipKey({ ...on, word: "RENTRÉ", tone: "off" }, "led"));
		expect(svg).toMatch(new RegExp(`<circle[^>]*fill="${SHIP_COLORS.off}"`));
		expect(svg).not.toContain(">—<");
	});

	test("une icône par fonction, rendu stable, texte échappé", () => {
		const icons = new Set(SHIP_FUNCTION_IDS.map((id) => svgOf(renderShipKey({ ...on, id }, "text"))));
		expect(icons.size).toBe(SHIP_FUNCTION_IDS.length);
		expect(renderShipKey(on, "led")).toBe(renderShipKey({ ...on }, "led"));
		expect(svgOf(renderShipKey({ ...on, label: "<a&b>" }, "text"))).toContain("&lt;a&amp;b&gt;");
	});
});
