import type { GameApi, StreamSubscription, TelemetryFrame } from "../game/types.js";

export type TelemetryHubOptions = {
	/** Âge au-delà duquel une section est considérée absente. */
	staleMs?: number;
	/** Attentes successives avant de rouvrir le flux ; la dernière sert de plafond. */
	retryMs?: number[];
	/** Fréquence de vérification de la péremption. */
	checkMs?: number;
	now?: () => number;
};

/**
 * Un seul abonnement `TelemetryStream` partagé par tous les afficheurs.
 * Le flux est ouvert tant qu'il y a au moins un abonné ; chaque section de premier niveau
 * (`actor`, `vehicle`…) garde sa dernière valeur et son heure de réception.
 */
export class TelemetryHub {
	readonly #game: Pick<GameApi, "openStream">;
	readonly #staleMs: number;
	readonly #retryMs: number[];
	readonly #checkMs: number;
	readonly #now: () => number;

	readonly #listeners = new Set<() => void>();
	readonly #sections = new Map<string, { value: Record<string, unknown>; at: number; stale: boolean }>();
	#stream: StreamSubscription | undefined;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;
	#checkTimer: ReturnType<typeof setInterval> | undefined;
	#attempt = 0;

	constructor(game: Pick<GameApi, "openStream">, opts: TelemetryHubOptions = {}) {
		this.#game = game;
		this.#staleMs = opts.staleMs ?? 3000;
		this.#retryMs = opts.retryMs ?? [1000, 2000, 4000, 5000];
		this.#checkMs = opts.checkMs ?? 500;
		this.#now = opts.now ?? Date.now;
	}

	/** Abonne `listener` (appelé à chaque frame et quand une section se périme). Renvoie le désabonnement. */
	subscribe(listener: () => void): () => void {
		const wrapped = () => listener();
		this.#listeners.add(wrapped);
		if (this.#listeners.size === 1) this.#start();
		return () => {
			if (!this.#listeners.delete(wrapped)) return;
			if (this.#listeners.size === 0) this.#stop();
		};
	}

	/** Dernière valeur reçue de la section si elle est assez récente, sinon `undefined`. */
	section(name: string): Record<string, unknown> | undefined {
		const s = this.#sections.get(name);
		if (!s || this.#now() - s.at >= this.#staleMs) return undefined;
		return s.value;
	}

	#start(): void {
		this.#attempt = 0;
		this.#open();
		this.#checkTimer = setInterval(() => this.#checkStale(), this.#checkMs);
	}

	#stop(): void {
		this.#stream?.cancel();
		this.#stream = undefined;
		clearTimeout(this.#retryTimer);
		clearInterval(this.#checkTimer);
		this.#retryTimer = undefined;
		this.#checkTimer = undefined;
	}

	#open(): void {
		this.#retryTimer = undefined;
		this.#stream = this.#game.openStream(
			(frame) => this.#onFrame(frame),
			() => this.#onEnd(),
		);
	}

	#onFrame(frame: TelemetryFrame): void {
		this.#attempt = 0;
		const at = this.#now();
		for (const [name, value] of Object.entries(frame)) {
			if (value && typeof value === "object") this.#sections.set(name, { value: value as Record<string, unknown>, at, stale: false });
		}
		this.#notify();
	}

	#onEnd(): void {
		this.#stream = undefined;
		if (this.#listeners.size === 0) return;
		const delay = this.#retryMs[Math.min(this.#attempt, this.#retryMs.length - 1)];
		this.#attempt++;
		this.#retryTimer = setTimeout(() => this.#open(), delay);
	}

	#checkStale(): void {
		let changed = false;
		for (const s of this.#sections.values()) {
			if (!s.stale && this.#now() - s.at >= this.#staleMs) {
				s.stale = true;
				changed = true;
			}
		}
		if (changed) this.#notify();
	}

	#notify(): void {
		for (const l of [...this.#listeners]) l();
	}
}
