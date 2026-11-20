import type { Lang } from "../catalog/labels.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import type { DisplayValueId, Level, Reading } from "./values.js";

/** Couleurs des niveaux (barre, jauge molette). */
export const COLORS: Record<Level, string> = {
	ok: "#1D9E75",
	warn: "#EF9F27",
	bad: "#E24B4A",
	none: "#5F5E5A",
};

/** Ce qu'une touche ou une molette affiche, déjà mis en forme dans la langue voulue. */
export type DisplayView = {
	short: string;
	long: string;
	text: string;
	unit: string;
	/** Remplissage de la barre 0–100 ; absent = donnée sans jauge. */
	bar?: number;
	color: string;
};

type LabelTable = { yes: string; no: string; values: Record<string, { short: string; long: string }> };
const TABLES: Record<Lang, LabelTable> = { fr, en };

/** Données qui ont une jauge (barre affichée, vide si indisponible). */
const WITH_BAR: ReadonlySet<DisplayValueId> = new Set(["health", "oxygen", "hunger", "thirst", "body_temperature"]);

const UNITS: Partial<Record<DisplayValueId, string>> = {
	health: "%",
	oxygen: "%",
	hunger: "%",
	thirst: "%",
	body_temperature: "°C",
	external_temperature: "°C",
	heart_rate: "bpm",
	gravity: "g",
	balance: "aUEC",
};

const DECIMALS: Partial<Record<DisplayValueId, number>> = {
	body_temperature: 1,
	gravity: 2,
	pressure: 2,
	radiation: 2,
};

function fixed(value: number, decimals: number, lang: Lang): string {
	const s = value.toFixed(decimals);
	return lang === "fr" ? s.replace(".", ",") : s;
}

/** Solde compact : 999, 12,3 k / 12.3k, 123 k, 15,0 M / 15.0M, 1,2 Md / 1.2B. */
function compactMoney(raw: string, lang: Lang): string {
	const n = Number(raw);
	if (!Number.isFinite(n)) return raw;
	const steps: [number, string, string][] = [
		[1e9, "Md", "B"],
		[1e6, "M", "M"],
		[1e3, "k", "k"],
	];
	for (const [size, frSuffix, enSuffix] of steps) {
		if (Math.abs(n) >= size) {
			const scaled = n / size;
			const text = fixed(scaled, Math.abs(scaled) < 100 ? 1 : 0, lang);
			return lang === "fr" ? `${text} ${frSuffix}` : `${text}${enSuffix}`;
		}
	}
	return String(Math.round(n));
}

export function toView(id: DisplayValueId, reading: Reading, lang: Lang): DisplayView {
	const table = TABLES[lang];
	const { short, long } = table.values[id];
	const base = { short, long };
	if (!reading.available) {
		return WITH_BAR.has(id)
			? { ...base, text: "—", unit: "", bar: 0, color: COLORS.none }
			: { ...base, text: "—", unit: "", color: COLORS.none };
	}
	const unit = UNITS[id] ?? "";
	switch (reading.kind) {
		case "percent":
			return { ...base, text: String(Math.round(reading.percent)), unit, bar: reading.percent, color: COLORS[reading.level] };
		case "number": {
			const text = fixed(reading.value, DECIMALS[id] ?? 0, lang);
			const view: DisplayView = { ...base, text, unit, color: COLORS[reading.level] };
			if (reading.bar !== undefined) view.bar = reading.bar;
			return view;
		}
		case "bool":
			return { ...base, text: reading.value ? table.yes : table.no, unit: "", color: COLORS.none };
		case "money":
			return { ...base, text: compactMoney(reading.value, lang), unit, color: COLORS.none };
	}
}
