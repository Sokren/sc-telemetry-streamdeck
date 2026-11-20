import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { normalizeText, toToggleTimes } from "../morse/encode.js";
import type { MorsePlayer } from "../morse/player.js";

/** Réglages enregistrés par touche (les champs du panneau peuvent arriver en texte). */
export type MorseSettings = { text?: string; unitMs?: number; repeat?: number };

const DEFAULTS = { text: "SOS", unitMs: 400, repeat: 1 };

function bounded(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function readSettings(s: MorseSettings): { text: string; unitMs: number; repeat: number } {
	return {
		text: typeof s.text === "string" && s.text.trim() !== "" ? s.text : DEFAULTS.text,
		unitMs: bounded(s.unitMs, 100, 2000, DEFAULTS.unitMs),
		repeat: bounded(s.repeat, 1, 10, DEFAULTS.repeat),
	};
}

export type MorseActionDeps = { player: MorsePlayer; log: (msg: string) => void };

/**
 * Fait clignoter la torche en morse. Un appui pendant une émission (sur n'importe quelle touche Morse) l'arrête.
 * L'action enregistrée auprès de Stream Deck est `MorseCodeAction` (morse-code-action.ts).
 */
export class MorseAction extends SingletonAction<MorseSettings> {
	constructor(private readonly deps: MorseActionDeps) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent<MorseSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setTitle(normalizeText(readSettings(ev.payload.settings).text));
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MorseSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setTitle(normalizeText(readSettings(ev.payload.settings).text));
	}

	override async onKeyDown(ev: KeyDownEvent<MorseSettings>): Promise<void> {
		const { player } = this.deps;
		if (player.playing) {
			player.stop();
			return;
		}
		const { text, unitMs, repeat } = readSettings(ev.payload.settings);
		const times = toToggleTimes(text, unitMs, repeat);
		const title = normalizeText(text);
		if (times.length === 0) {
			await ev.action.showAlert();
			return;
		}
		// Démarrer avant tout await : un 2e appui immédiat voit déjà `playing` et arrête au lieu de relancer.
		const run = player.play(times);
		await ev.action.setTitle(`● ${title}`);
		const result = await run;
		await ev.action.setTitle(title);
		if (result === "done") await ev.action.showOk();
		if (result === "failed") {
			this.deps.log(`Morse « ${title} » interrompu : la torche n'a pas pu être basculée (jeu lancé, perso spawné ?)`);
			await ev.action.showAlert();
		}
	}
}
