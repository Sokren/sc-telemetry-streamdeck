import { labelFor, type Lang } from "../catalog/labels.js";
import { commandFor, mergedGroup } from "../catalog/merged.js";
import { toView } from "../display/format.js";
import { renderKeySvg } from "../display/render.js";
import { isDisplayValueId, readValue } from "../display/values.js";
import { DANGEROUS_ACTIONS } from "../game/dangerous.js";
import type { GameApi } from "../game/types.js";
import { normalizeText } from "../morse/encode.js";
import { SHIP_FUNCTION_IDS, type ShipFunctionId } from "../ship/functions.js";
import type { ShipMode } from "../ship/press.js";
import { renderShipKey, toShipView, type ShipStyle } from "../ship/render.js";
import { readShipState } from "../ship/state.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import type { Tile } from "./layout.js";
import type { MorseControl } from "./morse-control.js";
import { TRIGGER_TIMEOUT_MS } from "./routes/actions.js";
import { pressShipFunction } from "./routes/ship.js";
import { renderLabelTile } from "./tile-render.js";

export type TileContext = {
	hub: Pick<TelemetryHub, "section">;
	game: Pick<GameApi, "trigger">;
	morse: MorseControl;
	lang: Lang;
};

export type TileFeedback = { feedback: "ok" | "alert"; detail?: string };

const MODES: readonly ShipMode[] = ["toggle", "on", "off"];
const STYLES: readonly ShipStyle[] = ["text", "led", "fill"];
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const shipId = (x: unknown): ShipFunctionId =>
	(SHIP_FUNCTION_IDS as readonly unknown[]).includes(x) ? (x as ShipFunctionId) : "gear";
const modeOf = (x: unknown): ShipMode => (MODES.includes(x as ShipMode) ? (x as ShipMode) : "toggle");

/** Commande du jeu d'une tuile d'action (regroupement `group:…` + mode, ou commande seule). */
function commandOf(tile: Tile): string | undefined {
	const action = str(tile.settings.action);
	const group = mergedGroup(action);
	return group ? commandFor(group, modeOf(tile.settings.mode)) : action;
}

/** Image d'une tuile, avec les mêmes dessins que les touches du plugin quand ils existent. */
export function renderTile(tile: Tile, ctx: Omit<TileContext, "game">): string {
	switch (tile.type) {
		case "ship-toggle": {
			const id = shipId(tile.settings.function);
			const style = STYLES.includes(tile.settings.style as ShipStyle) ? (tile.settings.style as ShipStyle) : "text";
			const state = readShipState(id, ctx.hub.section("vehicle"), ctx.hub.section("actor"));
			return renderShipKey(toShipView(id, state, ctx.lang), style);
		}
		case "actor-display": {
			const id = isDisplayValueId(tile.settings.value) ? tile.settings.value : "oxygen";
			return renderKeySvg(toView(id, readValue(id, ctx.hub.section("actor")), ctx.lang));
		}
		case "morse": {
			const text = normalizeText(str(tile.settings.text) ?? "SOS") || "SOS";
			const active = ctx.morse.playing && ctx.morse.text === text;
			return renderLabelTile({ kind: "morse", label: text, sub: "Morse", active });
		}
		case "ship-action": {
			const group = mergedGroup(tile.settings.action);
			if (group) {
				const mode = modeOf(tile.settings.mode);
				const label = toShipView(group.fn, "unknown", ctx.lang).label;
				const sub = mode === "toggle" ? undefined : toShipView(group.fn, mode, ctx.lang).word;
				return renderLabelTile({ kind: "ship", label, sub });
			}
			return renderLabelTile({ kind: "ship", label: labelFor(str(tile.settings.action) ?? "", ctx.lang) });
		}
		case "actor-action":
			return renderLabelTile({ kind: "actor", label: labelFor(str(tile.settings.action) ?? "", ctx.lang) });
	}
}

/** Appui sur une tuile : mêmes règles que les touches du plugin (actions dangereuses jamais envoyées). */
export async function pressTile(tile: Tile, ctx: Omit<TileContext, "lang">): Promise<TileFeedback> {
	switch (tile.type) {
		case "actor-display":
			return { feedback: "ok" };
		case "morse": {
			if (ctx.morse.stop()) return { feedback: "ok" };
			const r = ctx.morse.start(tile.settings);
			return r === "started" ? { feedback: "ok" } : { feedback: "alert", detail: r };
		}
		case "ship-toggle": {
			const outcome = await pressShipFunction(shipId(tile.settings.function), modeOf(tile.settings.mode), ctx);
			if (outcome.status === 200) return { feedback: "ok" };
			// Détail indépendant de la langue : code de refus, ou statut renvoyé par le jeu.
			return { feedback: "alert", detail: outcome.status === 409 ? outcome.json.code : outcome.json.reason };
		}
		case "actor-action":
		case "ship-action": {
			const command = commandOf(tile);
			if (!command) return { feedback: "alert", detail: "no_action" };
			if (DANGEROUS_ACTIONS.has(command)) return { feedback: "alert", detail: "dangerous_action" };
			const result = await ctx.game.trigger(command, TRIGGER_TIMEOUT_MS);
			return result.ok ? { feedback: "ok" } : { feedback: "alert", detail: result.reason };
		}
	}
}
