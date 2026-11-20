import fs from "node:fs";
import type { GameAction, GameApi } from "../game/types.js";

export const LIST_TIMEOUT_MS = 1500;
/** Durée de vie de la liste du jeu en cache (un patch ou un redémarrage du jeu peut la changer). */
export const CACHE_TTL_MS = 60_000;

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
 * Liste des actions : celle du jeu s'il répond avec une liste non vide (gardée en cache
 * `CACHE_TTL_MS` ou jusqu'à `invalidate()`), sinon l'instantané embarqué.
 */
export class ActionSource {
	#cache: { actions: GameAction[]; at: number } | undefined;

	constructor(
		private readonly game: GameApi,
		private readonly snapshot: () => GameAction[],
		private readonly now: () => number = Date.now,
	) {}

	async getActions(): Promise<{ actions: GameAction[]; live: boolean }> {
		if (this.#cache && this.now() - this.#cache.at < CACHE_TTL_MS) return { actions: this.#cache.actions, live: true };
		this.#cache = undefined;
		try {
			const actions = await this.game.listActions(LIST_TIMEOUT_MS);
			// Liste vide : jeu en chargement ou perso pas spawné — ne pas la retenir.
			if (actions.length === 0) return { actions: this.snapshot(), live: false };
			this.#cache = { actions, at: this.now() };
			return { actions, live: true };
		} catch {
			return { actions: this.snapshot(), live: false };
		}
	}

	invalidate(): void {
		this.#cache = undefined;
	}
}
