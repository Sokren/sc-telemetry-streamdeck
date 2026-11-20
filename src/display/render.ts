import { COLORS, type DisplayView } from "./format.js";

const BG = "#111418";
const LABEL = "#9AA4B2";
const VALUE = "#FFFFFF";
const UNIT = "#C9D1DB";
const TRACK = "#2A3038";
const FONT = "Segoe UI, Arial, sans-serif";

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Taille de la valeur selon sa longueur, pour qu'elle tienne sur la touche. */
function valueSize(text: string): number {
	const n = [...text].length;
	if (n <= 3) return 46;
	if (n <= 5) return 36;
	return 28;
}

/** Image de touche 144×144 (data URI SVG) : libellé court, valeur, unité, barre éventuelle. */
export function renderKeySvg(view: DisplayView): string {
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="${BG}"/>`,
		`<text x="72" y="32" font-family="${FONT}" font-size="20" fill="${LABEL}" text-anchor="middle">${escapeXml(view.short)}</text>`,
		`<text x="72" y="${view.unit ? 84 : 92}" font-family="${FONT}" font-size="${valueSize(view.text)}" font-weight="bold" fill="${VALUE}" text-anchor="middle">${escapeXml(view.text)}</text>`,
	];
	if (view.unit) {
		parts.push(`<text x="72" y="110" font-family="${FONT}" font-size="18" fill="${UNIT}" text-anchor="middle">${escapeXml(view.unit)}</text>`);
	}
	if (view.bar !== undefined) {
		parts.push(`<rect x="14" y="121" width="116" height="10" rx="5" fill="${TRACK}"/>`);
		const width = Math.round((116 * Math.min(100, Math.max(0, view.bar))) / 100);
		if (width > 0) parts.push(`<rect x="14" y="121" width="${width}" height="10" rx="5" fill="${view.color}"/>`);
	}
	parts.push(`</svg>`);
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(""))}`;
}

/**
 * Contenu de l'écran d'une molette (clés de `layouts/actor-display.json`).
 * Le libellé utilise la clé `label` : `title` est réservée au titre de l'action, masqué par le manifeste.
 */
export function toFeedback(view: DisplayView): { label: string; value: string; indicator: { value: number; bar_fill_c: string } } {
	return {
		label: view.long,
		value: view.unit ? `${view.text} ${view.unit}` : view.text,
		indicator:
			view.bar !== undefined
				? { value: Math.round(view.bar), bar_fill_c: view.color }
				: { value: 0, bar_fill_c: COLORS.none },
	};
}
