import {
	SingletonAction,
	type Action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import type { Lang } from "../catalog/labels.js";
import type { GameApi } from "../game/types.js";
import { SHIP_FUNCTIONS, shipFunction, type ShipFunctionId } from "../ship/functions.js";
import { decidePress, type ShipMode } from "../ship/press.js";
import { renderShipKey, shipFunctionName, toShipView, type ShipStyle } from "../ship/render.js";
import { readShipState } from "../ship/state.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import { TRIGGER_TIMEOUT_MS } from "./category-action.js";
import { ThrottledRenderer } from "./throttled-renderer.js";

export const FUNCTIONS_EVENT = "getFunctions";

/** Réglages enregistrés par touche. */
export type ShipToggleSettings = { function?: ShipFunctionId; mode?: ShipMode; style?: ShipStyle };

const MODES: readonly ShipMode[] = ["toggle", "on", "off"];
const STYLES: readonly ShipStyle[] = ["text", "led", "fill"];

/** Réglages complets, valeurs inconnues remplacées par les défauts (train, bascule, texte). */
function resolve(s: ShipToggleSettings) {
	return {
		fn: shipFunction(s.function),
		mode: MODES.includes(s.mode as ShipMode) ? (s.mode as ShipMode) : "toggle",
		style: STYLES.includes(s.style as ShipStyle) ? (s.style as ShipStyle) : "text",
	};
}

export type ShipToggleDeps = {
	hub: Pick<TelemetryHub, "subscribe" | "section">;
	game: Pick<GameApi, "trigger">;
	lang: () => Lang;
	sendToPropertyInspector: (payload: JsonValue) => Promise<void>;
	log: (msg: string) => void;
	renderer?: ThrottledRenderer;
};

type Entry = { action: Action<ShipToggleSettings>; settings: ShipToggleSettings; unsubscribe: () => void };

/**
 * Interrupteur vaisseau avec état : l'image suit l'état lu dans le flux, un appui envoie la
 * commande décidée par `decidePress`. L'action enregistrée est `ShipToggleRegistered`.
 */
export class ShipToggleAction extends SingletonAction<ShipToggleSettings> {
	readonly #entries = new Map<string, Entry>();
	readonly #renderer: ThrottledRenderer;

	constructor(private readonly deps: ShipToggleDeps) {
		super();
		this.#renderer = deps.renderer ?? new ThrottledRenderer();
	}

	override async onWillAppear(ev: WillAppearEvent<ShipToggleSettings>): Promise<void> {
		const id = ev.action.id;
		this.#entries.get(id)?.unsubscribe();
		this.#renderer.forget(id);
		const entry: Entry = { action: ev.action, settings: ev.payload.settings, unsubscribe: () => {} };
		this.#entries.set(id, entry);
		entry.unsubscribe = this.deps.hub.subscribe(() => void this.#render(id));
		await this.#render(id, true);
	}

	override async onWillDisappear(ev: WillDisappearEvent<ShipToggleSettings>): Promise<void> {
		this.#entries.get(ev.action.id)?.unsubscribe();
		this.#entries.delete(ev.action.id);
		this.#renderer.forget(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ShipToggleSettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.settings = ev.payload.settings;
		await this.#render(ev.action.id, true);
	}

	override async onKeyDown(ev: KeyDownEvent<ShipToggleSettings>): Promise<void> {
		const { fn, mode } = resolve(ev.payload.settings);
		const state = readShipState(fn.id, this.deps.hub.section("vehicle"), this.deps.hub.section("actor"));
		const decision = decidePress(fn, state, mode);
		if (decision.kind === "noop") {
			await ev.action.showOk();
			return;
		}
		if (decision.kind === "refuse") {
			this.deps.log(`Ship Toggle refusé : ${decision.reason}`);
			await ev.action.showAlert();
			return;
		}
		const result = await this.deps.game.trigger(decision.action, TRIGGER_TIMEOUT_MS);
		if (result.ok) {
			await ev.action.showOk();
			return;
		}
		this.deps.log(`Échec de ${decision.action} : ${result.reason}${result.message ? ` — ${result.message}` : ""}`);
		await ev.action.showAlert();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ShipToggleSettings>): Promise<void> {
		const p = ev.payload;
		if (typeof p !== "object" || p === null || Array.isArray(p) || p.event !== FUNCTIONS_EVENT) return;
		const lang = this.deps.lang();
		const items = SHIP_FUNCTIONS.map((f) => ({ label: shipFunctionName(f.id, lang), value: f.id }));
		await this.deps.sendToPropertyInspector({ event: FUNCTIONS_EVENT, items });
	}

	#render(id: string, force = false): Promise<void> {
		return this.#renderer.request(
			id,
			() => {
				const entry = this.#entries.get(id);
				if (!entry) return undefined;
				const { fn, style } = resolve(entry.settings);
				const state = readShipState(fn.id, this.deps.hub.section("vehicle"), this.deps.hub.section("actor"));
				const image = renderShipKey(toShipView(fn.id, state, this.deps.lang()), style);
				const { action } = entry;
				return { payload: image, send: async () => (action.isKey() ? action.setImage(image) : undefined) };
			},
			force,
		);
	}
}
