import type { IncomingMessage, ServerResponse } from "node:http";
import type { Lang } from "../catalog/labels.js";
import { DISPLAY_VALUES } from "../display/values.js";
import type { GameApi } from "../game/types.js";
import { SHIP_FUNCTION_IDS } from "../ship/functions.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import type { Tile } from "./layout.js";
import type { MorseControl } from "./morse-control.js";
import { characterOf, shipStatusOf } from "./panels.js";
import { shipStateOf } from "./routes/ship.js";
import { vitalOf } from "./routes/vitals.js";
import { renderTile, type TileFeedback } from "./tiles.js";

export type EventHubDeps = {
	hub: Pick<TelemetryHub, "subscribe" | "section">;
	game: Pick<GameApi, "trigger">;
	morse: MorseControl;
	layout: () => readonly Tile[];
	status: () => unknown;
	/** Intervalle minimal entre deux envois (défaut 250 ms). */
	intervalMs?: number;
};

type Client = { res: ServerResponse; lang: Lang; status?: string; tiles: string[]; state?: string };

const PING_MS = 15_000;

/**
 * Flux temps réel (Server-Sent Events) : état de l'appli, images des tuiles qui changent,
 * constantes et fonctions vaisseau, retours d'appui. Abonné au flux du jeu tant qu'un client écoute.
 */
export class EventHub {
	readonly #clients = new Set<Client>();
	readonly #interval: number;
	#unsubscribe: (() => void)[] = [];
	#timer: ReturnType<typeof setTimeout> | undefined;
	#ping: ReturnType<typeof setInterval> | undefined;
	#lastFlush = Number.NEGATIVE_INFINITY;

	constructor(private readonly deps: EventHubDeps) {
		this.#interval = deps.intervalMs ?? 250;
	}

	connect(req: IncomingMessage, res: ServerResponse, lang: Lang): void {
		res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
		const client: Client = { res, lang, tiles: [] };
		this.#clients.add(client);
		if (this.#clients.size === 1) this.#start();
		req.on("close", () => this.#remove(client));
		this.#send(client);
	}

	/** Retour ✔ / ⚠ d'un appui de tuile, pour toutes les pages connectées. */
	feedback(index: number, feedback: TileFeedback): void {
		for (const c of this.#clients) this.#write(c, "feedback", { index, ...feedback });
	}

	close(): void {
		for (const c of [...this.#clients]) {
			c.res.end();
			this.#remove(c);
		}
	}

	#start(): void {
		const changed = () => this.#schedule();
		this.#unsubscribe = [this.deps.hub.subscribe(changed), this.deps.morse.onChange(changed)];
		this.#ping = setInterval(() => {
			for (const c of this.#clients) c.res.write(": ping\n\n");
		}, PING_MS);
	}

	#remove(client: Client): void {
		if (!this.#clients.delete(client) || this.#clients.size > 0) return;
		this.#unsubscribe.forEach((u) => u());
		this.#unsubscribe = [];
		clearInterval(this.#ping);
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	#schedule(): void {
		if (this.#timer) return;
		const wait = Math.max(0, this.#lastFlush + this.#interval - Date.now());
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.#lastFlush = Date.now();
			for (const c of this.#clients) this.#send(c);
		}, wait);
	}

	/** Envoie au client ce qui a changé depuis son dernier envoi. */
	#send(c: Client): void {
		const status = JSON.stringify(this.deps.status());
		if (status !== c.status) {
			c.status = status;
			this.#writeRaw(c, "status", status);
		}
		const ctx = { hub: this.deps.hub, morse: this.deps.morse, lang: c.lang };
		this.deps.layout().forEach((tile, index) => {
			const image = renderTile(tile, ctx);
			if (image !== c.tiles[index]) {
				c.tiles[index] = image;
				this.#write(c, "tile", { index, image });
			}
		});
		const actor = this.deps.hub.section("actor");
		const state = JSON.stringify({
			vitals: DISPLAY_VALUES.map((id) => vitalOf(id, actor, c.lang)),
			ship: SHIP_FUNCTION_IDS.map((id) => shipStateOf(id, this.deps.hub, c.lang)),
			character: characterOf(actor, c.lang),
			shipStatus: shipStatusOf(this.deps.hub.section("vehicle"), actor, c.lang),
		});
		if (state !== c.state) {
			c.state = state;
			this.#writeRaw(c, "state", state);
		}
	}

	#write(c: Client, event: string, data: unknown): void {
		this.#writeRaw(c, event, JSON.stringify(data));
	}

	#writeRaw(c: Client, event: string, json: string): void {
		c.res.write(`event: ${event}\ndata: ${json}\n\n`);
	}
}
