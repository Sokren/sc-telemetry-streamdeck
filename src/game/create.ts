import { GameClient } from "./client.js";
import { loadSchema } from "./schema.js";
import type { GameAction, GameApi, StreamSubscription, TelemetryFrame, TriggerResult } from "./types.js";

/** Remplaçant quand le schéma est illisible : le plugin reste vivant et chaque appui affiche ⚠. */
class SchemaUnavailable implements GameApi {
	constructor(private readonly detail: string) {}
	async listActions(): Promise<GameAction[]> {
		throw new Error(`Schéma indisponible : ${this.detail}`);
	}
	async trigger(): Promise<TriggerResult> {
		return { ok: false, reason: "SCHEMA", message: this.detail };
	}
	openStream(_onFrame: (frame: TelemetryFrame) => void, onEnd: (err?: Error) => void): StreamSubscription {
		let cancelled = false;
		setTimeout(() => cancelled || onEnd(new Error(`Schéma indisponible : ${this.detail}`)), 0);
		return { cancel: () => void (cancelled = true) };
	}
	close(): void {}
}

/** Client du jeu depuis le schéma `descPath` ; un schéma absent ou abîmé ne fait pas planter le plugin. */
export function createGameApi(descPath: string, log: (msg: string) => void, address?: string): GameApi {
	try {
		return new GameClient(loadSchema(descPath), address);
	} catch (err) {
		const detail = `${descPath} : ${(err as Error).message}`;
		log(`Impossible de charger le schéma ${detail}`);
		return new SchemaUnavailable(detail);
	}
}
