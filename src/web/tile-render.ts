/** Image des tuiles qui n'ont pas de dessin dans le plugin (actions perso, commandes vaisseau, morse). */
export type LabelTileKind = "actor" | "ship" | "morse";

const BG = "#111418";
const TEXT = "#FFFFFF";
const SUB = "#9AA4B2";
const ACCENT: Record<LabelTileKind, string> = { actor: "#7FD1FF", ship: "#7FD1FF", morse: "#FFD166" };
const FONT = "Segoe UI, Arial, sans-serif";

const ICONS: Record<LabelTileKind, string> = {
	actor: "M12 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6M6 21v-5a6 6 0 0 1 12 0v5M17 9l3-5",
	ship: "M12 3l3 7h5l-4 4 2 7-6-4-6 4 2-7-4-4h5z",
	morse: "M4 12h3M10 12h7M20 12h0.5M7 6l2 2M17 6l-2 2",
};

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Coupe un libellé en au plus deux lignes d'environ `width` caractères. */
function lines(label: string, width = 13): string[] {
	const words = label.split(/\s+/).filter(Boolean);
	const out: string[] = [];
	let current = "";
	for (const w of words) {
		if (current && `${current} ${w}`.length > width) {
			out.push(current);
			current = w;
		} else current = current ? `${current} ${w}` : w;
	}
	if (current) out.push(current);
	if (out.length > 2) return [out[0], `${out.slice(1).join(" ").slice(0, width - 1)}…`];
	return out;
}

/** Tuile 144×144 (data URI SVG) : icône du type, libellé sur une ou deux lignes, sous-titre éventuel. */
export function renderLabelTile(t: { kind: LabelTileKind; label: string; sub?: string; active?: boolean }): string {
	const accent = ACCENT[t.kind];
	const rows = lines(t.label);
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="${BG}"/>`,
		`<g transform="translate(52 12) scale(1.67)" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[t.kind]}"/></g>`,
	];
	rows.forEach((row, i) => {
		const y = rows.length === 1 ? 88 : 80 + i * 22;
		parts.push(`<text x="72" y="${y}" font-family="${FONT}" font-size="19" font-weight="bold" fill="${TEXT}" text-anchor="middle">${escapeXml(row)}</text>`);
	});
	const sub = t.active ? `● ${t.sub ?? ""}`.trim() : t.sub;
	if (sub) {
		parts.push(`<text x="72" y="128" font-family="${FONT}" font-size="16" fill="${t.active ? accent : SUB}" text-anchor="middle">${escapeXml(sub)}</text>`);
	}
	parts.push(`</svg>`);
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(""))}`;
}
