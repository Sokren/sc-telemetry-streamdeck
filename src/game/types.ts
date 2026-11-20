/** Action déclenchable exposée par le jeu (`ListTriggerableActions`). */
export type GameAction = {
	name: string;
	category: string;
	holdable: boolean;
};

/**
 * Résultat d'un déclenchement. `reason` vaut le nom du statut renvoyé par le jeu
 * (`TRIGGER_GAME_ACTION_STATUS_…`), `STATUS_<n>` pour une valeur inconnue, ou le nom
 * du code d'erreur gRPC (`UNAVAILABLE`, `DEADLINE_EXCEEDED`…).
 */
export type TriggerResult = { ok: true } | { ok: false; reason: string; message?: string };

/**
 * Une frame du flux de télémétrie, décodée : noms snake_case, enums en texte, int64 en chaîne,
 * **sans** valeurs par défaut (une section ou un champ absent n'apparaît pas).
 */
export type TelemetryFrame = Record<string, unknown>;

/** Abonnement au flux ; `cancel()` l'arrête sans rappeler `onEnd`. */
export type StreamSubscription = { cancel(): void };

/** Ce dont le plugin a besoin de l'API du jeu. */
export interface GameApi {
	/** Rejette si le jeu ne répond pas dans le délai. */
	listActions(timeoutMs: number): Promise<GameAction[]>;
	/** Ne rejette jamais. */
	trigger(name: string, timeoutMs: number): Promise<TriggerResult>;
	/** Ouvre `TelemetryStream`. `onEnd` est appelé une seule fois (fin, erreur, jeu injoignable), jamais après `cancel()`. */
	openStream(onFrame: (frame: TelemetryFrame) => void, onEnd: (err?: Error) => void): StreamSubscription;
	close(): void;
}
