import { DANGEROUS_ACTIONS } from "../game/dangerous.js";
import type { ShipFunction } from "./functions.js";
import type { ShipState } from "./state.js";

/** Mode d'appui réglé sur la touche. */
export type ShipMode = "toggle" | "on" | "off";

export type PressDecision = { kind: "send"; action: string } | { kind: "noop" } | { kind: "refuse"; reason: string };

/**
 * Ce qu'un appui doit faire, d'après l'état lu et le mode de la touche.
 * L'état fait foi : on envoie la commande On / Off de l'état voulu plutôt qu'une bascule, sauf si
 * l'état est inconnu ou si la fonction n'a qu'une bascule. Une action dangereuse n'est jamais envoyée.
 */
export function decidePress(fn: ShipFunction, state: ShipState, mode: ShipMode): PressDecision {
	const effective: ShipMode = fn.onlyOn ? "on" : mode;
	if (state === "unavailable") return { kind: "refuse", reason: `${fn.id} : fonction absente de ce vaisseau` };

	let action: string | undefined;
	if (state === "unknown") {
		action = effective === "toggle" ? fn.toggle : effective === "on" ? fn.on : fn.off;
	} else {
		const isOn = state === "on" || state === "moving-on";
		const target = effective === "toggle" ? (isOn ? "off" : "on") : effective;
		if (state === target) return { kind: "noop" };
		// État connu et différent de la cible : basculer est sûr si la fonction n'a pas de commande dédiée.
		action = (target === "on" ? fn.on : fn.off) ?? fn.toggle;
	}

	if (!action) return { kind: "refuse", reason: `${fn.id} : aucune commande pour « ${effective} » (état ${state})` };
	if (DANGEROUS_ACTIONS.has(action)) return { kind: "refuse", reason: `Action dangereuse refusée : ${action}` };
	return { kind: "send", action };
}
