import type { Lang } from "../../catalog/labels.js";
import type { GameApi } from "../../game/types.js";
import { SHIP_FUNCTION_IDS, shipFunction, type ShipFunctionId } from "../../ship/functions.js";
import { decidePress, type ShipMode } from "../../ship/press.js";
import { shipFunctionName, toShipView } from "../../ship/render.js";
import { readShipState, type ShipState } from "../../ship/state.js";
import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";
import { TRIGGER_TIMEOUT_MS } from "./actions.js";

export type ShipFunctionState = { id: ShipFunctionId; name: string; label: string; state: ShipState; word: string };

const isId = (x: string): x is ShipFunctionId => (SHIP_FUNCTION_IDS as readonly string[]).includes(x);
const MODES: readonly ShipMode[] = ["toggle", "on", "off"];

export function shipStateOf(id: ShipFunctionId, hub: Pick<TelemetryHub, "section">, lang: Lang): ShipFunctionState {
	const state = readShipState(id, hub.section("vehicle"), hub.section("actor"));
	const view = toShipView(id, state, lang);
	return { id, name: shipFunctionName(id, lang), label: view.label, state, word: view.word };
}

/** Code stable d'un refus (indépendant de la langue). */
export type RefusalCode = "unavailable" | "no_command" | "dangerous_action";

const REFUSALS: Record<RefusalCode, Record<Lang, string>> = {
	unavailable: { fr: "Ce vaisseau n'a pas cette fonction.", en: "This ship does not have this function." },
	no_command: { fr: "Aucune commande sûre pour ce mode dans l'état actuel.", en: "No safe command for this mode in the current state." },
	dangerous_action: { fr: "Action dangereuse refusée.", en: "Dangerous action refused." },
};

export type PressOutcome =
	| { status: 200; json: { decision: "sent"; action: string; ok: true } | { decision: "noop" } }
	| { status: 409; json: { decision: "refused"; code: RefusalCode; reason: string } }
	| { status: 502; json: { decision: "sent"; action: string; ok: false; reason: string; message?: string } };

/** Appui sur une fonction vaisseau, mêmes règles que la touche Ship Toggle (`decidePress`). */
export async function pressShipFunction(
	id: ShipFunctionId,
	mode: ShipMode,
	deps: { hub: Pick<TelemetryHub, "section">; game: Pick<GameApi, "trigger"> },
	lang: Lang = "en",
): Promise<PressOutcome> {
	const fn = shipFunction(id);
	const state = readShipState(id, deps.hub.section("vehicle"), deps.hub.section("actor"));
	const decision = decidePress(fn, state, mode);
	if (decision.kind === "noop") return { status: 200, json: { decision: "noop" } };
	if (decision.kind === "refuse") {
		// La raison de `decidePress` (module partagé) est en français : on expose un code stable et une raison traduite.
		const code: RefusalCode =
			state === "unavailable" ? "unavailable" : decision.reason.startsWith("Action dangereuse") ? "dangerous_action" : "no_command";
		return { status: 409, json: { decision: "refused", code, reason: REFUSALS[code][lang] } };
	}
	const result = await deps.game.trigger(decision.action, TRIGGER_TIMEOUT_MS);
	return result.ok
		? { status: 200, json: { decision: "sent", action: decision.action, ok: true } }
		: { status: 502, json: { decision: "sent", action: decision.action, ok: false, reason: result.reason, ...(result.message ? { message: result.message } : {}) } };
}

export function shipRoutes(deps: { hub: Pick<TelemetryHub, "section">; game: Pick<GameApi, "trigger"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/ship/functions",
			handle: async ({ lang }) => ({ status: 200, json: SHIP_FUNCTION_IDS.map((id) => shipStateOf(id, deps.hub, lang)) }),
		},
		{
			method: "GET",
			path: "/api/v1/ship/functions/{id}",
			handle: async ({ params, lang }) =>
				isId(params.id) ? { status: 200, json: shipStateOf(params.id, deps.hub, lang) } : { status: 404, json: { error: "not_found" } },
		},
		{
			method: "POST",
			path: "/api/v1/ship/functions/{id}/press",
			handle: async ({ params, body, lang }) => {
				if (!isId(params.id)) return { status: 404, json: { error: "not_found" } };
				const asked = (body as { mode?: unknown } | undefined)?.mode;
				if (asked !== undefined && !MODES.includes(asked as ShipMode)) return { status: 400, json: { error: "bad_request" } };
				return pressShipFunction(params.id, (asked as ShipMode | undefined) ?? "toggle", deps, lang);
			},
		},
	];
}
