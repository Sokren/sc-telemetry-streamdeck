import type { TriggerResult } from "./types.js";

/** Le jeu ne connaît pas les commandes d'actions (ex. 4.10 : télémétrie seule, actions arrivées en 5.0). */
export const ACTIONS_UNSUPPORTED = "UNIMPLEMENTED";

/** Ligne de journal pour un déclenchement refusé ; explicite (FR / EN) quand la version du jeu est en cause. */
export function failureLog(action: string, result: Extract<TriggerResult, { ok: false }>): string {
	if (result.reason === ACTIONS_UNSUPPORTED) {
		return (
			`${action} : actions non disponibles avec cette version du jeu (Star Citizen 5.0 requis) / ` +
			`actions not available with this game version (Star Citizen 5.0 required)`
		);
	}
	return `Échec de ${action} : ${result.reason}${result.message ? ` — ${result.message}` : ""}`;
}
