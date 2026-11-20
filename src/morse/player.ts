export type PlayResult = "done" | "stopped" | "failed";

/**
 * Exécute des bascules de torche à des instants donnés, sur une horloge absolue (la durée des
 * appels au jeu ne décale pas la suite). Une seule émission à la fois ; arrêtable. À l'arrêt ou en
 * cas d'échec, si la torche est restée allumée, elle est rebasculée une fois.
 */
export class MorsePlayer {
	#abort: AbortController | undefined;

	constructor(
		private readonly toggle: () => Promise<boolean>,
		private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>,
		private readonly now: () => number = Date.now,
	) {}

	get playing(): boolean {
		return this.#abort !== undefined;
	}

	stop(): void {
		this.#abort?.abort();
	}

	async play(times: number[]): Promise<PlayResult> {
		const abort = new AbortController();
		this.#abort = abort;
		const start = this.now();
		let lit = false;
		let result: PlayResult = "done";
		try {
			for (const at of times) {
				const delay = start + at - this.now();
				// Arrêt déjà demandé (pendant la bascule précédente) : ne pas attendre un signal passé.
				if (delay > 0 && !abort.signal.aborted) await this.wait(delay, abort.signal);
				if (abort.signal.aborted) {
					result = "stopped";
					break;
				}
				if (!(await this.toggle())) {
					result = "failed";
					break;
				}
				lit = !lit;
			}
			if (lit) await this.toggle();
			return result;
		} finally {
			this.#abort = undefined;
		}
	}
}
