import type { Lang } from "../catalog/labels.js";
import type { CountermeasureTracker } from "../display/countermeasures.js";
import { gimbalsWord, groupText } from "../display/ship-values.js";
import { DISPLAY_VALUES } from "../display/values.js";
import { readWeapons } from "../display/weapons.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import { vitalOf, type Vital } from "./routes/vitals.js";

type Obj = Record<string, unknown>;
type Level = "ok" | "warn" | "bad" | "none";
const TABLES = { fr, en };
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

const LOCOMOTION: Record<string, "on_foot" | "eva" | "seated"> = {
	ACTOR_LOCOMOTION_STATE_ON_FOOT: "on_foot",
	ACTOR_LOCOMOTION_STATE_EVA: "eva",
	ACTOR_LOCOMOTION_STATE_SEATED: "seated",
};
const CREW_ROLE: Record<string, "pilot" | "gunner" | "crew"> = {
	ACTOR_CREW_ROLE_PILOT: "pilot",
	ACTOR_CREW_ROLE_GUNNER: "gunner",
	ACTOR_CREW_ROLE_CREW: "crew",
};

export type Character = {
	available: boolean;
	locomotion: "on_foot" | "eva" | "seated" | "unknown";
	locomotionLabel: string;
	crewRole: "pilot" | "gunner" | "crew" | "none";
	crewRoleLabel: string;
	seat: string | null;
	vitals: Vital[];
};

/** Onglet Personnage : position, rôle, siège et les 13 constantes. `actor` absente → indisponible. */
export function characterOf(actor: Obj | undefined, lang: Lang): Character {
	const t = TABLES[lang];
	const state = obj(actor?.state) ?? {};
	const locomotion = actor ? (LOCOMOTION[String(state.locomotion)] ?? "unknown") : "unknown";
	const crewRole = actor ? (CREW_ROLE[String(state.crew_role)] ?? "none") : "none";
	return {
		available: actor !== undefined,
		locomotion,
		locomotionLabel: t.locomotion[locomotion],
		crewRole,
		crewRoleLabel: t.crewRole[crewRole],
		seat: typeof state.seat_name === "string" && state.seat_name ? state.seat_name : null,
		vitals: DISPLAY_VALUES.map((id) => vitalOf(id, actor, lang)),
	};
}

export type InstrumentId = "shields" | "hull" | "decoys" | "noise" | "weapons_ready" | "weapon_group" | "gimbals" | "hydrogen" | "quantum" | "speed" | "radar_altitude" | "heading";
export type Instrument = { id: InstrumentId; label: string; text: string; unit: string; percent?: number; level: Level };
export type AnnunciatorId = "pwr" | "wpn" | "thr" | "shld" | "cool" | "qdrv" | "radr" | "prox" | "hit" | "misl";
export type Annunciator = {
	id: AnnunciatorId;
	label: string;
	state: "off" | "nominal" | "minor" | "major" | "unknown";
	flashing: boolean;
};
export type ShipStatus = {
	available: boolean;
	name: string | null;
	landed: boolean | null;
	masterMode: "nav" | "scm" | "stealth" | null;
	masterModeLabel: string;
	instruments: Instrument[];
	annunciators: Annunciator[];
};

export const INSTRUMENTS: readonly InstrumentId[] = ["shields", "hull", "decoys", "noise", "weapons_ready", "weapon_group", "gimbals", "hydrogen", "quantum", "speed", "radar_altitude", "heading"];
const ANNUNCIATORS: readonly AnnunciatorId[] = ["pwr", "wpn", "thr", "shld", "cool", "qdrv", "radr", "prox", "hit", "misl"];
const MASTER: Record<string, "nav" | "scm" | "stealth"> = {
	VEHICLE_MASTER_MODE_NAVIGATION: "nav",
	VEHICLE_MASTER_MODE_SCM: "scm",
	VEHICLE_MASTER_MODE_STEALTH: "stealth",
};

const gaugeLevel = (p: number): Level => (p >= 50 ? "ok" : p >= 25 ? "warn" : "bad");
const fmt = (n: number, lang: Lang, decimals = 0) => {
	const s = n.toFixed(decimals);
	return lang === "fr" ? s.replace(".", ",") : s;
};

/** Nom lisible d'un vaisseau : `AEGS_Avenger_Titan` → « Avenger Titan » (code constructeur retiré). */
function shipName(state: Obj): string | null {
	const raw = typeof state.class_name === "string" && state.class_name ? state.class_name : undefined;
	if (!raw) return null;
	const parts = raw.split("_").filter(Boolean);
	return (parts.length > 1 ? parts.slice(1) : parts).join(" ");
}

function annunciator(x: unknown): Pick<Annunciator, "state" | "flashing"> {
	switch (x) {
		case "ANNUNCIATOR_STATE_OFF":
			return { state: "off", flashing: false };
		case "ANNUNCIATOR_STATE_NOMINAL":
			return { state: "nominal", flashing: false };
		case "ANNUNCIATOR_STATE_MINOR_ON":
			return { state: "minor", flashing: false };
		case "ANNUNCIATOR_STATE_MINOR_FLASHING":
			return { state: "minor", flashing: true };
		case "ANNUNCIATOR_STATE_MAJOR_ON":
			return { state: "major", flashing: false };
		case "ANNUNCIATOR_STATE_MAJOR_FLASHING":
			return { state: "major", flashing: true };
		default:
			return { state: "unknown", flashing: false };
	}
}

/** Contre-mesures : section `weapons` du flux et suivi du plus grand stock vu (le jeu ne donne pas le maximum). */
export type ShipCountermeasures = { weapons?: Obj; tracker: CountermeasureTracker };

/**
 * Onglet Vaisseau : nom, posé, mode, instruments et voyants. Mêmes règles que les touches :
 * pas de section `vehicle`, ou perso pas assis → indisponible (« — »).
 */
export function shipStatusOf(vehicle: Obj | undefined, actor: Obj | undefined, lang: Lang, cm?: ShipCountermeasures): ShipStatus {
	const t = TABLES[lang];
	const seated = !actor || obj(actor.state)?.locomotion === "ACTOR_LOCOMOTION_STATE_SEATED";
	const state = seated ? obj(vehicle?.state) : undefined;
	const none = (id: InstrumentId): Instrument => ({ id, label: t.instruments[id], text: "—", unit: "", level: "none" });
	// Contre-mesures : même règle que la touche Ship Display (section `weapons` fraîche, perso assis), même si
	// la section `vehicle` est en retard.
	const countermeasure = (id: "decoys" | "noise"): Instrument => {
		const r = cm ? cm.tracker.read(id === "decoys" ? "decoy" : "noise", { weapons: cm.weapons, vehicle, actor }) : undefined;
		if (!r?.available) return none(id);
		return { id, label: t.instruments[id], text: String(r.amount), unit: "", percent: r.percent, level: r.level };
	};
	// Armes : même règle (section `weapons` fraîche, perso assis), affichage seulement.
	const weapon = (id: "weapons_ready" | "weapon_group" | "gimbals"): Instrument => {
		const w = cm ? readWeapons({ weapons: cm.weapons, actor }) : undefined;
		if (!w?.available || !w.total) return none(id);
		const label = t.instruments[id];
		if (id === "weapon_group") return { id, label, text: groupText(w.group, lang), unit: "", level: "none" };
		if (id === "gimbals") return { id, label, text: gimbalsWord(w.gimbalsLocked, lang), unit: "", level: "none" };
		return { id, label, text: `${w.ready} / ${w.total}`, unit: "", percent: w.percent, level: w.level };
	};
	const fromWeapons = (id: InstrumentId): Instrument | undefined =>
		id === "decoys" || id === "noise" ? countermeasure(id) : id === "weapons_ready" || id === "weapon_group" || id === "gimbals" ? weapon(id) : undefined;
	if (!state) {
		return {
			available: false,
			name: null,
			landed: null,
			masterMode: null,
			masterModeLabel: "—",
			instruments: INSTRUMENTS.map((id) => fromWeapons(id) ?? none(id)),
			annunciators: ANNUNCIATORS.map((id) => ({ id, label: t.annunciators[id], state: "unknown", flashing: false })),
		};
	}
	const flight = obj(state.flight);
	const instr = obj(flight?.instruments);
	const gauge = (id: InstrumentId, ratio: number | undefined): Instrument => {
		if (ratio === undefined) return none(id);
		const percent = Math.min(100, Math.max(0, ratio * 100));
		return { id, label: t.instruments[id], text: String(Math.round(percent)), unit: "%", percent, level: gaugeLevel(percent) };
	};
	const plain = (id: InstrumentId, value: number | undefined, unit: string): Instrument =>
		value === undefined ? none(id) : { id, label: t.instruments[id], text: fmt(value, lang), unit, level: "none" };
	const shields = obj(state.shields);
	const instruments: Instrument[] = [
		gauge("shields", shields ? num(shields.level) : undefined),
		gauge("hull", num(state.health)),
		countermeasure("decoys"),
		countermeasure("noise"),
		weapon("weapons_ready"),
		weapon("weapon_group"),
		weapon("gimbals"),
		gauge("hydrogen", instr ? num(instr.hydrogen_fuel) : undefined),
		gauge("quantum", instr ? num(instr.quantum_fuel) : undefined),
		plain("speed", instr ? num(instr.speed) : undefined, "m/s"),
		plain("radar_altitude", instr ? num(instr.radar_altitude) : undefined, "m"),
		plain("heading", instr ? Math.round(num(instr.heading)) % 360 : undefined, "°"),
	];
	const ann = obj(state.annunciators);
	const masterMode = MASTER[String(obj(state.master_mode)?.mode)] ?? null;
	return {
		available: true,
		name: shipName(state),
		landed: flight ? obj(flight.state)?.is_landed === true : null,
		masterMode,
		masterModeLabel: masterMode ? t.masterMode[masterMode] : "—",
		instruments,
		annunciators: ANNUNCIATORS.map((id) => ({ id, label: t.annunciators[id], ...(ann ? annunciator(ann[id]) : annunciator(undefined)) })),
	};
}
