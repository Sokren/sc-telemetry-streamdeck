import {
	SingletonAction,
	type Action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { buildDropdown, type ActionGroup } from "../catalog/dropdown.js";
import { labelFor, type Lang } from "../catalog/labels.js";
import type { ActionSource } from "../catalog/source.js";
import type { GameApi } from "../game/types.js";

export const TRIGGER_TIMEOUT_MS = 2000;
/** Événement de la source de données du panneau de réglage (`datasource="getActions"`). */
export const DATASOURCE_EVENT = "getActions";

/** Réglages enregistrés par touche. */
export type ActionSettings = { action?: string };

export type CategoryActionDeps = {
	game: GameApi;
	source: ActionSource;
	groups: ActionGroup[];
	lang: () => Lang;
	sendToPropertyInspector: (payload: JsonValue) => Promise<void>;
	log: (msg: string) => void;
};

/**
 * Touche qui déclenche une action du jeu choisie parmi certaines catégories.
 * Chaque action Stream Deck concrète (Actor Action…) ne fait que fixer ses catégories.
 */
export abstract class CategoryAction extends SingletonAction<ActionSettings> {
	constructor(protected readonly deps: CategoryActionDeps) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		await this.#showTitle(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): Promise<void> {
		await this.#showTitle(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		const name = ev.payload.settings.action;
		if (!name) {
			await ev.action.showAlert();
			return;
		}
		const result = await this.deps.game.trigger(name, TRIGGER_TIMEOUT_MS);
		if (result.ok) {
			await ev.action.showOk();
			return;
		}
		if (result.reason === "UNAVAILABLE") this.deps.source.invalidate();
		this.deps.log(`Échec de ${name} : ${result.reason}${result.message ? ` — ${result.message}` : ""}`);
		await ev.action.showAlert();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ActionSettings>): Promise<void> {
		const payload = ev.payload;
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
		if (payload.event !== DATASOURCE_EVENT) return;
		const settings = await ev.action.getSettings();
		const { actions } = await this.deps.source.getActions();
		const items = buildDropdown(actions, this.deps.groups, this.deps.lang(), settings.action);
		await this.deps.sendToPropertyInspector({ event: DATASOURCE_EVENT, items });
	}

	async #showTitle(action: Action<ActionSettings>, settings: ActionSettings): Promise<void> {
		if (!action.isKey()) return;
		await action.setTitle(settings.action ? labelFor(settings.action, this.deps.lang()) : "");
	}
}
