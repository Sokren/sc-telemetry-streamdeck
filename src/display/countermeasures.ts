import type { Level } from "./values.js";

/**
 * Contre-mesures du vaisseau (section `weapons` du flux : `countermeasures[] { type, amount }`).
 * Le jeu ne donne pas le stock maximal : 100 % = le plus grand stock vu pour ce modèle de vaisseau
 * (`vehicle.state.class_name`), gardé en mémoire tant que le processus tourne.
 */
export type CmType = "decoy" | "noise";

export type CmReading = { available: false } | { available: true; amount: number; percent: number; level: Level };

type Obj = Record<string, unknown>;
/** Sections fraîches du flux (absente = jamais reçue ou périmée). */
export type ShipSections = { weapons?: Obj; vehicle?: Obj; actor?: Obj };

const TYPES: Record<string, CmType> = {
	COUNTERMEASURE_TYPE_DECOY: "decoy",
	COUNTERMEASURE_TYPE_NOISE: "noise",
};
const UNAVAILABLE: CmReading = { available: false };

const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);
const level = (percent: number): Level => (percent >= 50 ? "ok" : percent >= 25 ? "warn" : "bad");

export class CountermeasureTracker {
	/** Maximum vu par modèle de vaisseau puis par type. */
	readonly #max = new Map<string, Partial<Record<CmType, number>>>();
	/** Dernier modèle vu dans une frame (`undefined` : aucun encore). */
	#lastModel: string | undefined;

	/** Stocks lus (type absent = ce vaisseau n'en a pas) ; `undefined` si pas lisible (pas de section, perso à pied). */
	#amounts(s: ShipSections): Partial<Record<CmType, number>> | undefined {
		if (!s.weapons) return undefined;
		// Même règle que les instruments : `actor` absente = considéré assis.
		if (s.actor && obj(s.actor.state)?.locomotion !== "ACTOR_LOCOMOTION_STATE_SEATED") return undefined;
		const amounts: Partial<Record<CmType, number>> = {};
		const list = Array.isArray(s.weapons.countermeasures) ? s.weapons.countermeasures : [];
		for (const entry of list) {
			const e = obj(entry);
			const type = e ? TYPES[String(e.type)] : undefined;
			if (!type) continue;
			// proto3 : 0 n'est pas transmis.
			amounts[type] = typeof e!.amount === "number" && Number.isFinite(e!.amount) ? e!.amount : 0;
		}
		return amounts;
	}

	/** Modèle du vaisseau dans cette frame (section `vehicle` fraîche), sinon `undefined`. */
	#model(s: ShipSections): string | undefined {
		const cls = obj(s.vehicle?.state)?.class_name;
		if (typeof cls === "string" && cls) this.#lastModel = cls;
		return typeof cls === "string" && cls ? cls : undefined;
	}

	/**
	 * Met à jour les maximums à partir d'une frame. Seulement si le modèle figure dans cette même frame : à un
	 * changement de vaisseau, la section `vehicle` peut arriver après `weapons`, et le stock du nouveau vaisseau
	 * ne doit pas devenir le maximum de l'ancien.
	 */
	observe(s: ShipSections): void {
		const amounts = this.#amounts(s);
		const model = this.#model(s);
		if (!amounts || !model) return;
		const max = this.#max.get(model) ?? {};
		for (const [type, amount] of Object.entries(amounts) as [CmType, number][]) max[type] = Math.max(max[type] ?? 0, amount);
		this.#max.set(model, max);
	}

	read(type: CmType, s: ShipSections): CmReading {
		this.observe(s);
		const amount = this.#amounts(s)?.[type];
		if (amount === undefined) return UNAVAILABLE;
		// Aucun maximum connu (modèle pas encore vu) : le stock courant sert de référence.
		const max = (this.#lastModel ? this.#max.get(this.#lastModel)?.[type] : undefined) ?? amount;
		const percent = max > 0 ? Math.min(100, (amount / max) * 100) : 0;
		return { available: true, amount, percent, level: level(percent) };
	}
}
