import type { Lang } from "../catalog/labels.js";
import type { ShipFunctionId } from "./functions.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import type { ShipState } from "./state.js";

/** Apparence choisie sur la touche : A texte, B voyant, C fond coloré. */
export type ShipStyle = "text" | "led" | "fill";
export type Tone = "on" | "off" | "moving" | "none";

export type ShipView = { id: ShipFunctionId; label: string; word: string; tone: Tone };

export const SHIP_COLORS = {
	on: "#1D9E75",
	moving: "#EF9F27",
	off: "#888780",
	none: "#5F5E5A",
	onFill: "#0F6E56",
	movingFill: "#854F0B",
	background: "#111418",
	label: "#C9D1DB",
	white: "#FFFFFF",
	dim: "#444441",
} as const;

type FunctionLabels = { name: string; label: string; on: string; off: string };
const TABLES: Record<Lang, Record<string, FunctionLabels>> = { fr: fr.functions, en: en.functions };

/** Nom complet de la fonction (liste du panneau). */
export function shipFunctionName(id: ShipFunctionId, lang: Lang): string {
	return TABLES[lang][id].name;
}

export function toShipView(id: ShipFunctionId, state: ShipState, lang: Lang): ShipView {
	const l = TABLES[lang][id];
	switch (state) {
		case "on":
			return { id, label: l.label, word: l.on, tone: "on" };
		case "off":
			return { id, label: l.label, word: l.off, tone: "off" };
		case "moving-on":
		case "moving-off":
			return { id, label: l.label, word: "…", tone: "moving" };
		default:
			return { id, label: l.label, word: "—", tone: "none" };
	}
}

/** Glyphes au trait (grille 24×24), un par fonction. */
const ICONS: Record<ShipFunctionId, string> = {
	gear: "M12 4v11M7 10l5 5 5-5M5 20h14",
	lights: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
	vtol: "M12 20V9M7 14l5-5 5 5M5 4h14",
	transform: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
	decoupled: "M3 12h5M16 12h5M8 7v10M16 7v10",
	gsafe: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM12 8v5M12 16v.5",
	proximity: "M4 14a8 8 0 0 1 16 0M8 14a4 4 0 0 1 8 0M12 14v6",
	esp: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
	advanced_hud: "M3 5h18v14H3zM7 9h10M7 13h6",
	night_vision: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
	master_nav: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M15 9l-2 5-4 1 2-5z",
	power_engines: "M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z",
	power_weapons: "M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14M12 2v5M12 17v5M2 12h5M17 12h5",
	power_shields: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4",
	power_main: "M12 3v8M7 6a7 7 0 1 0 10 0",
	doors_closed: "M6 21V3h12v18M4 21h16M14 12h1",
	doors_locked: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2",
};

const FONT = "Segoe UI, Arial, sans-serif";
const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TONE_TEXT: Record<Tone, string> = { on: SHIP_COLORS.on, moving: SHIP_COLORS.moving, off: SHIP_COLORS.off, none: SHIP_COLORS.none };

/** Image de touche 144×144 (data URI SVG) d'un interrupteur vaisseau, dans le style choisi. */
export function renderShipKey(view: ShipView, style: ShipStyle): string {
	const filled = style === "fill" && (view.tone === "on" || view.tone === "moving");
	const bg = !filled ? SHIP_COLORS.background : view.tone === "on" ? SHIP_COLORS.onFill : SHIP_COLORS.movingFill;
	const iconColor = view.tone === "none" ? SHIP_COLORS.dim : view.tone === "off" ? SHIP_COLORS.off : SHIP_COLORS.white;
	const labelColor = view.tone === "none" ? SHIP_COLORS.none : SHIP_COLORS.label;
	const wordColor = filled ? SHIP_COLORS.white : TONE_TEXT[view.tone];
	const withWord = style !== "led";

	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="${bg}"/>`,
		`<g transform="translate(${withWord ? "48 14" : "44 20"}) scale(${withWord ? 2 : 2.33})" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[view.id]}"/></g>`,
		`<text x="72" y="${withWord ? 86 : 104}" font-family="${FONT}" font-size="${withWord ? 18 : 20}" fill="${labelColor}" text-anchor="middle">${escapeXml(view.label)}</text>`,
	];
	if (withWord) {
		const size = [...view.word].length > 7 ? 20 : 24;
		parts.push(
			`<text x="72" y="120" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${wordColor}" text-anchor="middle">${escapeXml(view.word)}</text>`,
		);
	}
	if (style === "led" && view.tone !== "none") {
		const led = view.tone === "on" ? SHIP_COLORS.on : view.tone === "moving" ? SHIP_COLORS.moving : SHIP_COLORS.dim;
		parts.push(`<circle cx="124" cy="20" r="9" fill="${led}"/>`);
	}
	parts.push(`</svg>`);
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(""))}`;
}
