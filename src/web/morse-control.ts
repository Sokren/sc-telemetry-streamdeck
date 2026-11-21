import type { GameApi } from "../game/types.js";
import { normalizeText, toToggleTimes } from "../morse/encode.js";
import { MorsePlayer } from "../morse/player.js";

export type MorseRequest = { text?: unknown; unitMs?: unknown; repeat?: unknown };
export type MorseSettings = { text: string; unitMs: number; repeat: number };

const TRIGGER_TIMEOUT_MS = 2000;

function bounded(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

const abortableWait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal.aborted) return resolve();
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
	});

/**
 * Émission morse de l'appli web : même encodage et même lecteur que la touche Morse Code du plugin
 * (une seule émission à la fois, remise en état de la torche à l'arrêt).
 */
export class MorseControl {
	readonly #player: MorsePlayer;
	readonly #listeners = new Set<() => void>();
	#text = "";

	constructor(game: Pick<GameApi, "trigger">, wait: (ms: number, signal: AbortSignal) => Promise<void> = abortableWait) {
		this.#player = new MorsePlayer(async () => (await game.trigger("toggle_flashlight", TRIGGER_TIMEOUT_MS)).ok, wait);
	}

	/** Réglages bornés comme la touche : texte « SOS », point 400 ms (100–2000), 1 répétition (1–10). */
	static settings(r: MorseRequest): MorseSettings {
		return {
			text: typeof r.text === "string" && r.text.trim() !== "" ? r.text : "SOS",
			unitMs: bounded(r.unitMs, 100, 2000, 400),
			repeat: bounded(r.repeat, 1, 10, 1),
		};
	}

	get playing(): boolean {
		return this.#player.playing;
	}

	/** Texte en cours d'émission (normalisé), vide sinon. */
	get text(): string {
		return this.playing ? this.#text : "";
	}

	onChange(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => void this.#listeners.delete(listener);
	}

	start(request: MorseRequest): "started" | "busy" | "empty" {
		if (this.#player.playing) return "busy";
		const s = MorseControl.settings(request);
		const times = toToggleTimes(s.text, s.unitMs, s.repeat);
		if (times.length === 0) return "empty";
		this.#text = normalizeText(s.text);
		const run = this.#player.play(times);
		this.#emit();
		void run.finally(() => this.#emit());
		return "started";
	}

	stop(): boolean {
		if (!this.#player.playing) return false;
		this.#player.stop();
		return true;
	}

	#emit(): void {
		for (const l of [...this.#listeners]) l();
	}
}
