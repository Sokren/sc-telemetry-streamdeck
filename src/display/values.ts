/** Données du personnage affichables, dans l'ordre de la liste (et de la rotation des molettes). */
export const DISPLAY_VALUES = [
	"health",
	"oxygen",
	"hunger",
	"thirst",
	"body_temperature",
	"external_temperature",
	"heart_rate",
	"gravity",
	"pressure",
	"radiation",
	"intoxication",
	"breathable",
	"balance",
] as const;

export type DisplayValueId = (typeof DISPLAY_VALUES)[number];

export function isDisplayValueId(x: unknown): x is DisplayValueId {
	return typeof x === "string" && (DISPLAY_VALUES as readonly string[]).includes(x);
}

/** Niveau de couleur ; `none` = donnée sans seuil (texte neutre). */
export type Level = "ok" | "warn" | "bad" | "none";

export type Reading =
	| { available: false }
	| { available: true; kind: "percent"; percent: number; level: Level }
	| { available: true; kind: "number"; value: number; bar?: number; level: Level }
	| { available: true; kind: "bool"; value: boolean }
	| { available: true; kind: "money"; value: string };

const UNAVAILABLE: Reading = { available: false };
const BODY_SCALE = { min: 30, max: 42 };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" ? (x as Obj) : undefined);
/** Champ numérique d'une section fraîche : absent = 0 (proto3 ne transmet pas les zéros). */
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function gaugeLevel(percent: number): Level {
	if (percent >= 50) return "ok";
	if (percent >= 25) return "warn";
	return "bad";
}

function bodyLevel(c: number): Level {
	if (c >= 35 && c <= 38) return "ok";
	if (c >= 34 && c <= 39) return "warn";
	return "bad";
}

/** Jauge `Gauge{current, max}` en pourcentage borné ; sous-message absent ou sans `max` → indisponible. */
function percentOf(gauge: unknown): Reading {
	const g = obj(gauge);
	const max = num(g?.max);
	if (!g || max <= 0) return UNAVAILABLE;
	const percent = clamp((num(g.current) / max) * 100, 0, 100);
	return { available: true, kind: "percent", percent, level: gaugeLevel(percent) };
}

/**
 * Lit une donnée dans la section `actor` du flux. `actor` absente (ou périmée, donc `undefined`)
 * → indisponible ; champ scalaire absent dans une section présente → 0 / faux.
 */
export function readValue(id: DisplayValueId, actor: Obj | undefined): Reading {
	if (!actor) return UNAVAILABLE;
	const vitals = obj(actor.vitals) ?? {};
	const env = obj(actor.environment) ?? {};
	const state = obj(actor.state) ?? {};
	const plain = (value: number): Reading => ({ available: true, kind: "number", value, level: "none" });

	switch (id) {
		case "health":
		case "oxygen":
		case "hunger":
		case "thirst":
			return percentOf(vitals[id]);
		case "body_temperature": {
			const g = obj(vitals.body_temperature);
			if (!g) return UNAVAILABLE;
			const value = num(g.current);
			const bar = clamp(((value - BODY_SCALE.min) / (BODY_SCALE.max - BODY_SCALE.min)) * 100, 0, 100);
			return { available: true, kind: "number", value, bar, level: bodyLevel(value) };
		}
		case "external_temperature":
			return plain(num(env.external_temperature));
		case "heart_rate":
			return plain(num(vitals.heart_rate));
		case "gravity":
			return plain(num(vitals.gravity));
		case "pressure":
			return plain(num(vitals.pressure));
		case "radiation":
			return plain(num(env.ambient_radiation_rate));
		case "intoxication":
			return plain(num(vitals.intoxication_level));
		case "breathable":
			return { available: true, kind: "bool", value: env.breathable_atmosphere === true };
		case "balance": {
			const b = state.uec_balance;
			return { available: true, kind: "money", value: typeof b === "string" || typeof b === "number" ? String(b) : "0" };
		}
	}
}
