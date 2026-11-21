import type { Lang } from "../catalog/labels.js";
import type { CmReading, CmType, CountermeasureTracker, ShipSections } from "./countermeasures.js";
import { COLORS, type DisplayView } from "./format.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };

/** Données du vaisseau affichables par « Ship Display », dans l'ordre de la liste (et de la rotation des molettes). */
export const SHIP_DISPLAY_VALUES = ["countermeasures", "decoys", "noise"] as const;

export type ShipDisplayValueId = (typeof SHIP_DISPLAY_VALUES)[number];

export function isShipDisplayValueId(x: unknown): x is ShipDisplayValueId {
	return typeof x === "string" && (SHIP_DISPLAY_VALUES as readonly string[]).includes(x);
}

const LABELS = { fr: fr.values, en: en.values } as Record<Lang, Record<string, { short: string; long: string }>>;

type Available = Extract<CmReading, { available: true }>;

/** Ce qu'affichent une touche ou une molette « Ship Display » (même forme que « Actor Display »). */
export function shipView(id: ShipDisplayValueId, s: ShipSections, tracker: CountermeasureTracker, lang: Lang): DisplayView {
	const labels = LABELS[lang];
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
