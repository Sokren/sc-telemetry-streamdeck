import {
	SingletonAction,
	type Action,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import type { Lang } from "../catalog/labels.js";
import { toView } from "../display/format.js";
import { renderKeySvg, toFeedback } from "../display/render.js";
import { DISPLAY_VALUES, isDisplayValueId, readValue, type DisplayValueId } from "../display/values.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import { ThrottledRenderer } from "./throttled-renderer.js";

export const DIAL_LAYOUT = "layouts/actor-display.json";
export const VALUES_EVENT = "getValues";
/** Intervalle minimal entre deux envois vers une même touche ou molette. */
export const MIN_INTERVAL_MS = 250;
const DEFAULT_VALUE: DisplayValueId = "oxygen";

/** Réglages enregistrés par touche / molette. */
export type DisplaySettings = { value?: DisplayValueId };

export type DisplayActionDeps = {
	hub: Pick<TelemetryHub, "subscribe" | "section">;
	lang: () => Lang;
	sendToPropertyInspector: (payload: JsonValue) => Promise<void>;
	now?: () => number;
	schedule?: (fn: () => void, ms: number) => void;
};

type Entry = {
	action: Action<DisplaySettings>;
	value: DisplayValueId;
	unsubscribe: () => void;
};

const valueOf = (s: DisplaySettings): DisplayValueId => (isDisplayValueId(s.value) ? s.value : DEFAULT_VALUE);

/**
 * Affiche une constante du perso, mise à jour en continu depuis le flux du jeu.
 * Touche : image (chiffre + jauge). Molette : écran + rotation pour changer de donnée.
 * L'action enregistrée auprès de Stream Deck est `ActorDisplayAction` (actor-display-action.ts).
 */
export class DisplayAction extends SingletonAction<DisplaySettings> {
	readonly #entries = new Map<string, Entry>();
	readonly #renderer: ThrottledRenderer;

	constructor(private readonly deps: DisplayActionDeps) {
		super();
		this.#renderer = new ThrottledRenderer({ now: deps.now, schedule: deps.schedule, minIntervalMs: MIN_INTERVAL_MS });
	}

	override async onWillAppear(ev: WillAppearEvent<DisplaySettings>): Promise<void> {
		const id = ev.action.id;
		this.#entries.get(id)?.unsubscribe();
		this.#renderer.forget(id);
		if (ev.action.isDial()) await ev.action.setFeedbackLayout(DIAL_LAYOUT);
		const entry: Entry = { action: ev.action, value: valueOf(ev.payload.settings), unsubscribe: () => {} };
		this.#entries.set(id, entry);
		entry.unsubscribe = this.deps.hub.subscribe(() => this.#render(id));
		await this.#render(id, true);
	}

	override async onWillDisappear(ev: WillDisappearEvent<DisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.unsubscribe();
		this.#entries.delete(ev.action.id);
		this.#renderer.forget(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.value = valueOf(ev.payload.settings);
		await this.#render(ev.action.id, true);
	}

	override async onDialRotate(ev: DialRotateEvent<DisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		const n = DISPLAY_VALUES.length;
		const i = DISPLAY_VALUES.indexOf(entry.value);
		entry.value = DISPLAY_VALUES[(((i + ev.payload.ticks) % n) + n) % n];
		await ev.action.setSettings({ value: entry.value });
		await this.#render(ev.action.id, true);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, DisplaySettings>): Promise<void> {
		const p = ev.payload;
		if (typeof p !== "object" || p === null || Array.isArray(p) || p.event !== VALUES_EVENT) return;
		const lang = this.deps.lang();
		const items = DISPLAY_VALUES.map((id) => ({ label: toView(id, { available: false }, lang).long, value: id }));
		await this.deps.sendToPropertyInspector({ event: VALUES_EVENT, items });
	}

	/** Envoie le rendu courant s'il a changé, au plus une fois par `MIN_INTERVAL_MS` (sinon envoi différé). */
	#render(id: string, force = false): Promise<void> {
		return this.#renderer.request(
			id,
			() => {
				const entry = this.#entries.get(id);
				if (!entry) return undefined;
				const { action } = entry;
				const view = toView(entry.value, readValue(entry.value, this.deps.hub.section("actor")), this.deps.lang());
				if (action.isDial()) {
					const feedback = toFeedback(view);
					return { payload: JSON.stringify(feedback), send: () => action.setFeedback(feedback) };
				}
				const image = renderKeySvg(view);
				return { payload: image, send: async () => (action.isKey() ? action.setImage(image) : undefined) };
			},
			force,
		);
	}
}
