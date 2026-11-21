import type { ShipSections } from "./countermeasures.js";
import type { Level } from "./values.js";

/**
 * Armes du vaisseau (section `weapons` du flux : `WeaponsFrame`). Affichage seulement : le jeu n'expose aucune
 * commande pour changer de groupe d'armes ou de cardans.
 */
export type WeaponsReading =
	| { available: false }
	| {
			available: true;
			/** Armes prêtes à tirer / nombre d'armes. */
			ready: number;
			total: number;
			percent: number;
			level: Level;
			/** Groupe actif : index (0 si absent, proto3) et nom s'il n'est pas vide. */
			group: { index: number; name?: string };
			gimbalsLocked: boolean;
	  };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);

/** Même règle que les contre-mesures et les instruments : section fraîche, perso assis (`actor` absente = assis). */
export function readWeapons(s: ShipSections): WeaponsReading {
	if (!s.weapons) return { available: false };
	if (s.actor && obj(s.actor.state)?.locomotion !== "ACTOR_LOCOMOTION_STATE_SEATED") return { available: false };
	const list = (Array.isArray(s.weapons.weapons) ? s.weapons.weapons : []).map(obj).filter((w): w is Obj => !!w);
	const total = list.length;
	const ready = list.filter((w) => w.ready_to_fire === true).length;
	const percent = total ? (ready / total) * 100 : 0;
	const level: Level = total && ready === total ? "ok" : ready > 0 ? "warn" : "bad";
	const index = typeof s.weapons.preset_index === "number" && s.weapons.preset_index >= 0 ? s.weapons.preset_index : 0;
	const name = typeof s.weapons.preset_name === "string" ? s.weapons.preset_name.trim() : "";
	return {
		available: true,
		ready,
		total,
		percent,
		level,
		group: name ? { index, name } : { index },
		gimbalsLocked: obj(s.weapons.settings)?.gimbals_locked === true,
	};
}
