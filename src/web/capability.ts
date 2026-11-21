import type { GameApi } from "../game/types.js";

/**
 * Le jeu accepte-t-il les actions ? Déduit de l'API seule : la commande `ListTriggerableActions`
 * n'existe qu'à partir de la 5.0 ; un jeu 4.10 répond « UNIMPLEMENTED » (code gRPC 12).
 * `unknown` : jeu injoignable ou réponse inattendue (on ne conclut rien).
 */
export type Capability = "available" | "unsupported" | "unknown";

const UNIMPLEMENTED = 12;

export class ActionCapability {
	#value: Capability = "unknown";
	#timer: ReturnType<typeof setInterval> | undefined;
	readonly #listeners = new Set<(value: Capability) => void>();
	readonly #intervalMs: number;
	readonly #timeoutMs: number;

	constructor(
		private readonly game: Pick<GameApi, "listActions">,
		opts: { intervalMs?: number; timeoutMs?: number } = {},
	) {
		this.#intervalMs = opts.intervalMs ?? 30_000;
		this.#timeoutMs = opts.timeoutMs ?? 1500;
	}

	get value(): Capability {
		return this.#value;
	}

	onChange(listener: (value: Capability) => void): () => void {
		this.#listeners.add(listener);
		return () => void this.#listeners.delete(listener);
	}

	async refresh(): Promise<Capability> {
		let next: Capability;
		try {
			await this.game.listActions(this.#timeoutMs);
			next = "available";
		} catch (err) {
			next = (err as { code?: unknown }).code === UNIMPLEMENTED ? "unsupported" : "unknown";
		}
		if (next !== this.#value) {
			this.#value = next;
			for (const l of [...this.#listeners]) l(next);
		}
		return next;
	}

	/** Vérifie tout de suite puis à intervalle régulier (le joueur peut changer de version du jeu). */
	start(): void {
		void this.refresh();
		this.#timer = setInterval(() => void this.refresh(), this.#intervalMs);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}
}
