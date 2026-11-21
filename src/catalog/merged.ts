import { SHIP_FUNCTIONS, type ShipFunctionId } from "../ship/functions.js";
import type { ShipMode } from "../ship/press.js";

/** Commandes on / off / bascule d'une même fonction, présentées en une seule ligne dans Ship Action. */
export type MergedCommand = { id: `group:${ShipFunctionId}`; fn: ShipFunctionId; on: string; off: string; toggle: string };

/** Fonctions qui ont les trois commandes (les fonctions « On seulement » et l'ESP n'en font pas partie). */
export const MERGED_COMMANDS: readonly MergedCommand[] = SHIP_FUNCTIONS.flatMap((f) =>
	f.on && f.off && f.toggle ? [{ id: `group:${f.id}` as const, fn: f.id, on: f.on, off: f.off, toggle: f.toggle }] : [],
);

export function mergedGroup(id: unknown): MergedCommand | undefined {
	return MERGED_COMMANDS.find((g) => g.id === id);
}

/** Commande du jeu pour un regroupement et un mode ; mode absent ou inconnu → bascule. */
export function commandFor(group: MergedCommand, mode: ShipMode | undefined): string {
	if (mode === "on") return group.on;
	if (mode === "off") return group.off;
	return group.toggle;
}

/** Regroupement et mode correspondant à une commande seule (conversion des touches déjà réglées). */
export function mergedFor(command: string): { group: MergedCommand["id"]; mode: ShipMode } | undefined {
	for (const g of MERGED_COMMANDS) {
		if (command === g.on) return { group: g.id, mode: "on" };
		if (command === g.off) return { group: g.id, mode: "off" };
		if (command === g.toggle) return { group: g.id, mode: "toggle" };
	}
	return undefined;
}
