import fs from "node:fs";
import type { GameAction, GameApi } from "../game/types.js";

export const LIST_TIMEOUT_MS = 1500;

/** Lit l'instantané `actions.json` ; fichier absent ou illisible → liste vide. */
export function readSnapshot(path: string): GameAction[] {
	try {
		const data = JSON.parse(fs.readFileSync(path, "utf-8")) as {
			actions?: { action_name: string; category: string; holdable?: boolean }[];
		};
		return (data.actions ?? []).map((a) => ({ name: a.action_name, category: a.category, holdable: a.holdable === true }));
	} catch {
		return [];
	}
}

/**
 * Liste des actions : celle du jeu s'il répond (gardée en cache jusqu'à `invalidate()`),
 * sinon l'instantané embarqué.
 */
export class ActionSource {
	#cache: GameAction[] | undefined;

	constructor(
		private readonly game: GameApi,
		private readonly snapshot: () => GameAction[],
	) {}

	async getActions(): Promise<{ actions: GameAction[]; live: boolean }> {
		if (this.#cache) return { actions: this.#cache, live: true };
		try {
			this.#cache = await this.game.listActions(LIST_TIMEOUT_MS);
			return { actions: this.#cache, live: true };
		} catch {
			return { actions: this.snapshot(), live: false };
		}
	}

	invalidate(): void {
		this.#cache = undefined;
	}
}
