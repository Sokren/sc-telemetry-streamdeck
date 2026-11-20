/** Rendu à envoyer : `payload` sert à éviter les doublons, `send` l'envoie au Stream Deck. */
export type RenderJob = { payload: string; send: () => Promise<void> };

export type ThrottledRendererOptions = {
	now?: () => number;
	schedule?: (fn: () => void, ms: number) => void;
	/** Intervalle minimal entre deux envois vers une même touche ou molette. */
	minIntervalMs?: number;
};

type Slot = { lastSent?: string; lastAt: number; pending: boolean };

/**
 * Limite les envois vers chaque touche / molette : rien si le rendu n'a pas changé, au plus un
 * envoi par `minIntervalMs`, et un envoi différé du **dernier** état quand ça arrive trop vite.
 */
export class ThrottledRenderer {
	readonly #slots = new Map<string, Slot>();
	readonly #now: () => number;
	readonly #schedule: (fn: () => void, ms: number) => void;
	readonly #minIntervalMs: number;

	constructor(opts: ThrottledRendererOptions = {}) {
		this.#now = opts.now ?? Date.now;
		this.#schedule = opts.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
		this.#minIntervalMs = opts.minIntervalMs ?? 250;
	}

	/** Demande un rendu de `id`. `compute` est rappelée au moment de l'envoi (état le plus récent). */
	async request(id: string, compute: () => RenderJob | undefined, force = false): Promise<void> {
		const job = compute();
		if (!job) return;
		let slot = this.#slots.get(id);
		if (!slot) {
			slot = { lastAt: Number.NEGATIVE_INFINITY, pending: false };
			this.#slots.set(id, slot);
		}
		if (job.payload === slot.lastSent) return;
		const wait = slot.lastAt + this.#minIntervalMs - this.#now();
		if (!force && wait > 0) {
			if (!slot.pending) {
				slot.pending = true;
				const s = slot;
				this.#schedule(() => {
					s.pending = false;
					if (this.#slots.get(id) === s) void this.request(id, compute);
				}, wait);
			}
			return;
		}
		slot.lastSent = job.payload;
		slot.lastAt = this.#now();
		await job.send();
	}

	/** Oublie `id` (touche disparue) : un envoi différé en attente est abandonné. */
	forget(id: string): void {
		this.#slots.delete(id);
	}
}
