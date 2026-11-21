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
import { CountermeasureTracker } from "../display/countermeasures.js";
import { renderKeySvg, toFeedback } from "../display/render.js";
import { isShipDisplayValueId, SHIP_DISPLAY_VALUES, shipView, type ShipDisplayValueId } from "../display/ship-values.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import { DIAL_LAYOUT, MIN_INTERVAL_MS, VALUES_EVENT } from "./display-action.js";
import { ThrottledRenderer } from "./throttled-renderer.js";

const DEFAULT_VALUE: ShipDisplayValueId = "countermeasures";

/** Réglages enregistrés par touche / molette. */
export type ShipDisplaySettings = { value?: ShipDisplayValueId };

export type ShipDisplayActionDeps = {
	hub: Pick<TelemetryHub, "subscribe" | "section">;
	lang: () => Lang;
	sendToPropertyInspector: (payload: JsonValue) => Promise<void>;
	now?: () => number;
	schedule?: (fn: () => void, ms: number) => void;
};

type Entry = { action: Action<ShipDisplaySettings>; value: ShipDisplayValueId; unsubscribe: () => void };

const valueOf = (s: ShipDisplaySettings): ShipDisplayValueId => (isShipDisplayValueId(s.value) ? s.value : DEFAULT_VALUE);

/**
 * Affiche une donnée du vaisseau (contre-mesures : leurres, brouilleurs), mise à jour en continu depuis le flux.
 * Touche : image (nombre + jauge). Molette : écran + rotation pour changer de donnée. Même rendu que « Actor Display ».
 * 100 % = plus grand stock vu pour ce modèle de vaisseau pendant qu'un afficheur est visible (le jeu ne donne pas le maximum).
 * L'action enregistrée auprès de Stream Deck est `ShipDisplayAction` (ship-display-action.ts).
 */
export class ShipDisplay extends SingletonAction<ShipDisplaySettings> {
	readonly #entries = new Map<string, Entry>();
	readonly #renderer: ThrottledRenderer;
	readonly #tracker = new CountermeasureTracker();

	constructor(private readonly deps: ShipDisplayActionDeps) {
		super();
		this.#renderer = new ThrottledRenderer({ now: deps.now, schedule: deps.schedule, minIntervalMs: MIN_INTERVAL_MS });
	}

	override async onWillAppear(ev: WillAppearEvent<ShipDisplaySettings>): Promise<void> {
		const id = ev.action.id;
		this.#entries.get(id)?.unsubscribe();
		this.#renderer.forget(id);
		if (ev.action.isDial()) await ev.action.setFeedbackLayout(DIAL_LAYOUT);
		const entry: Entry = { action: ev.action, value: valueOf(ev.payload.settings), unsubscribe: () => {} };
		this.#entries.set(id, entry);
		entry.unsubscribe = this.deps.hub.subscribe(() => this.#render(id));
		await this.#render(id, true);
	}

	override async onWillDisappear(ev: WillDisappearEvent<ShipDisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.unsubscribe();
		this.#entries.delete(ev.action.id);
		this.#renderer.forget(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ShipDisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.value = valueOf(ev.payload.settings);
		await this.#render(ev.action.id, true);
	}

	override async onDialRotate(ev: DialRotateEvent<ShipDisplaySettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		const n = SHIP_DISPLAY_VALUES.length;
		const i = SHIP_DISPLAY_VALUES.indexOf(entry.value);
		entry.value = SHIP_DISPLAY_VALUES[(((i + ev.payload.ticks) % n) + n) % n];
		await ev.action.setSettings({ value: entry.value });
		await this.#render(ev.action.id, true);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ShipDisplaySettings>): Promise<void> {
		const p = ev.payload;
		if (typeof p !== "object" || p === null || Array.isArray(p) || p.event !== VALUES_EVENT) return;
		const lang = this.deps.lang();
		const items = SHIP_DISPLAY_VALUES.map((id) => ({ label: shipView(id, {}, this.#tracker, lang).long, value: id }));
		await this.deps.sendToPropertyInspector({ event: VALUES_EVENT, items });
	}

	#render(id: string, force = false): Promise<void> {
		return this.#renderer.request(
			id,
			() => {
				const entry = this.#entries.get(id);
				if (!entry) return undefined;
				const { action } = entry;
				const sections = {
					weapons: this.deps.hub.section("weapons"),
					vehicle: this.deps.hub.section("vehicle"),
					actor: this.deps.hub.section("actor"),
				};
				const view = shipView(entry.value, sections, this.#tracker, this.deps.lang());
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
