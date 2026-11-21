import type { Lang } from "../catalog/labels.js";
import type { CmReading, CmType, CountermeasureTracker, ShipSections } from "./countermeasures.js";
import { COLORS, type DisplayView } from "./format.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import { readWeapons } from "./weapons.js";

/** Données du vaisseau affichables par « Ship Display », dans l'ordre de la liste (et de la rotation des molettes). */
export const SHIP_DISPLAY_VALUES = ["countermeasures", "decoys", "noise", "weapons", "weapon_group", "gimbals"] as const;

export type ShipDisplayValueId = (typeof SHIP_DISPLAY_VALUES)[number];

export function isShipDisplayValueId(x: unknown): x is ShipDisplayValueId {
	return typeof x === "string" && (SHIP_DISPLAY_VALUES as readonly string[]).includes(x);
}

type Table = { values: Record<string, { short: string; long: string }>; gimbals: { locked: string; free: string }; allWeapons: string };
const TABLES = { fr, en } as Record<Lang, Table>;

type Available = Extract<CmReading, { available: true }>;

/** Mots « Fixes / Libres » des cardans, aussi utilisés par l'appli web. */
export const gimbalsWord = (locked: boolean, lang: Lang): string => TABLES[lang].gimbals[locked ? "locked" : "free"];

/** Groupe d'armes : son nom, sinon son numéro tel qu'en jeu (0 = toutes les armes, puis 1, 2…). */
export const groupText = (group: { index: number; name?: string }, lang: Lang): string =>
	group.name ?? (group.index === 0 ? TABLES[lang].allWeapons : String(group.index));

/** Au-delà, un texte ne tient plus sur une touche de 144 px (taille 28 en gras) : raccourci avec « … ». */
const KEY_MAX = 9;
const fit = (text: string): string => ([...text].length > KEY_MAX ? `${[...text].slice(0, KEY_MAX - 1).join("").trimEnd()}…` : text);

/** Ce qu'affichent une touche ou une molette « Ship Display » (même forme que « Actor Display »). */
export function shipView(id: ShipDisplayValueId, s: ShipSections, tracker: CountermeasureTracker, lang: Lang): DisplayView {
	const labels = TABLES[lang].values;
	if (id === "weapons" || id === "weapon_group" || id === "gimbals") {
		const { short, long } = labels[id];
		const w = readWeapons(s);
		const none = id === "weapons" ? { short, long, text: "—", unit: "", bar: 0, color: COLORS.none } : { short, long, text: "—", unit: "", color: COLORS.none };
		// Sans arme (siège passager, vaisseau désarmé) : rien à montrer, ni groupe ni cardans.
		if (!w.available || !w.total) return none;
		if (id === "weapon_group") return { short, long, text: fit(groupText(w.group, lang)), unit: "", color: COLORS.none };
		if (id === "gimbals") return { short, long, text: gimbalsWord(w.gimbalsLocked, lang), unit: "", color: COLORS.none };
		return { short, long, text: `${w.ready} / ${w.total}`, unit: "", bar: w.percent, color: COLORS[w.level] };
	}
	const types: CmType[] = id === "decoys" ? ["decoy"] : id === "noise" ? ["noise"] : ["decoy", "noise"];
	const present = types.map((type) => ({ type, r: tracker.read(type, s) })).filter((x): x is { type: CmType; r: Available } => x.r.available);
	// Vaisseau avec un seul type : son propre libellé, pour savoir lequel est affiché.
	const { short, long } = id === "countermeasures" && present.length === 1 ? labels[present[0].type === "decoy" ? "decoys" : "noise"] : labels[id];
	const readings = present.map((x) => x.r);
	if (!readings.length) return { short, long, text: "—", unit: "", bar: 0, color: COLORS.none };
	// Jauge et couleur : la contre-mesure la plus entamée.
	const lowest = readings.reduce((a, b) => (b.percent < a.percent ? b : a));
	return { short, long, text: readings.map((r) => String(r.amount)).join(" / "), unit: "", bar: lowest.percent, color: COLORS[lowest.level] };
}
