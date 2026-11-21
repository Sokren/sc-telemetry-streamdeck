import type { Action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { SHIP_GROUPS, buildDropdown } from "../catalog/dropdown.js";
import { labelFor } from "../catalog/labels.js";
import { MERGED_COMMANDS, commandFor, mergedFor, mergedGroup } from "../catalog/merged.js";
import type { ShipMode } from "../ship/press.js";
import { toShipView } from "../ship/render.js";
import { CategoryAction, DATASOURCE_EVENT, type ActionSettings, type CategoryActionDeps } from "./category-action.js";

/** Réglages de Ship Action : une commande du jeu, ou un regroupement `group:…` et son mode. */
export type ShipCommandSettings = ActionSettings & { mode?: ShipMode };

/**
 * Commandes vaisseau et siège sans état. Les commandes on / off / bascule d'une même fonction sont
 * regroupées en une ligne, avec un mode. L'action enregistrée est `ShipAction` (ship-action.ts).
 */
export class ShipCommandAction extends CategoryAction {
	constructor(deps: Omit<CategoryActionDeps, "groups">) {
		super({ ...deps, groups: SHIP_GROUPS });
	}

	override async onWillAppear(ev: WillAppearEvent<ShipCommandSettings>): Promise<void> {
		let settings = ev.payload.settings;
		// Touche réglée avant les regroupements (ex. v_lights_on) : convertie en regroupement + mode.
		const converted = settings.action ? mergedFor(settings.action) : undefined;
		if (converted) {
			settings = { action: converted.group, mode: converted.mode };
			await ev.action.setSettings(settings);
		}
		await this.#title(ev.action, settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ShipCommandSettings>): Promise<void> {
		await this.#title(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ShipCommandSettings>): Promise<void> {
		const { action: chosen, mode } = ev.payload.settings;
		if (!chosen?.startsWith("group:")) return super.onKeyDown(ev);
		const group = mergedGroup(chosen);
		if (!group) {
			this.deps.log(`Ship Action : regroupement inconnu ${chosen}`);
			await ev.action.showAlert();
			return;
		}
		// Même chemin que les commandes seules (garde-fou des actions dangereuses, ✔ / ⚠, journal).
		return super.onKeyDown({ ...ev, payload: { ...ev.payload, settings: { action: commandFor(group, mode) } } } as KeyDownEvent<ShipCommandSettings>);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ShipCommandSettings>): Promise<void> {
		const p = ev.payload;
		if (typeof p !== "object" || p === null || Array.isArray(p) || p.event !== DATASOURCE_EVENT) return;
		const settings = await ev.action.getSettings();
		const { actions } = await this.deps.source.getActions();
		const items = buildDropdown(actions, this.deps.groups, this.deps.lang(), settings.action, MERGED_COMMANDS);
		await this.deps.sendToPropertyInspector({ event: DATASOURCE_EVENT, items });
	}

	/** Titre : libellé de la commande, ou libellé court du regroupement + mot du mode (rien en bascule). */
	async #title(action: Action<ShipCommandSettings>, s: ShipCommandSettings): Promise<void> {
		if (!action.isKey()) return;
		const lang = this.deps.lang();
		const group = mergedGroup(s.action);
		if (!group) {
			await action.setTitle(s.action ? labelFor(s.action, lang) : "");
			return;
		}
		const label = toShipView(group.fn, "unknown", lang).label;
		if (s.mode !== "on" && s.mode !== "off") {
			await action.setTitle(label);
			return;
		}
		const word = toShipView(group.fn, s.mode, lang).word;
		await action.setTitle(`${label}\n${word}`);
	}
}
