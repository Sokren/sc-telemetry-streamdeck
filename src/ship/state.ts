import type { ShipFunctionId } from "./functions.js";

/**
 * État lu d'une fonction : `unavailable` = le vaisseau n'a pas la fonction ;
 * `unknown` = pas de données fiables (jeu fermé, pas dans un vaisseau, valeur inattendue).
 */
export type ShipState = "on" | "off" | "moving-on" | "moving-off" | "unavailable" | "unknown";

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);
const bool = (x: unknown): ShipState => (x === true ? "on" : "off");

const DEPLOYMENT: Record<string, ShipState> = {
	VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED: "on",
	VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTED: "off",
	VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYING: "moving-on",
	VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTING: "moving-off",
};

/** Champ `optional` d'enum de déploiement : absent → le vaisseau n'a pas la fonction. */
function deployment(x: unknown): ShipState {
	if (x === undefined) return "unavailable";
	return (typeof x === "string" && DEPLOYMENT[x]) || "unknown";
}

/** `Availability{enabled, active}` : sous-message absent ou `enabled` faux → indisponible. */
function availability(x: unknown, invert = false): ShipState {
	const a = obj(x);
	if (!a || a.enabled !== true) return "unavailable";
	return (a.active === true) !== invert ? "on" : "off";
}

/** Valeur d'enum attendue → on / off, absente ou autre → unknown. */
function enumPair(x: unknown, on: string, off: string): ShipState {
	if (x === on) return "on";
	if (x === off) return "off";
	return "unknown";
}

const NAV = "VEHICLE_MASTER_MODE_NAVIGATION";
const SCM = "VEHICLE_MASTER_MODE_SCM";

/**
 * Lit l'état d'une fonction. `vehicle` : section `vehicle` du flux (état sous `.state`), `undefined`
 * si absente ou périmée. `actor` : section `actor` ; si elle est fraîche et que le perso n'est pas
 * assis, l'état est inconnu (vaisseau quitté).
 */
export function readShipState(id: ShipFunctionId, vehicle: Obj | undefined, actor: Obj | undefined): ShipState {
	if (actor && obj(actor.state)?.locomotion !== "ACTOR_LOCOMOTION_STATE_SEATED") return "unknown";
	const state = obj(vehicle?.state);
	if (!state) return "unknown";

	const flight = obj(state.flight);
	const flightState = obj(flight?.state) ?? {};
	const settings = obj(flight?.settings) ?? {};
	const masterMode = obj(state.master_mode);
	const power = obj(state.power);
	const doors = obj(state.doors);

	switch (id) {
		case "gear":
			return deployment(flightState.gear);
		case "vtol":
			return deployment(flightState.vtol);
		case "transform":
			return deployment(flightState.transformation);
		case "lights":
			return bool(state.lights_enabled);
		case "decoupled":
			return availability(settings.ifcs_coupled, true);
		case "gsafe":
			return availability(settings.ifcs_g_safe);
		case "proximity":
			return availability(settings.ifcs_proximity_assist);
		case "esp":
			return availability(settings.ifcs_esp);
		case "night_vision":
			return flight ? bool(settings.flight_light_amplification) : "unavailable";
		case "master_nav":
			return masterMode ? enumPair(masterMode.mode, NAV, SCM) : "unavailable";
		case "advanced_hud": {
			if (!flight) return "unavailable";
			const mode = masterMode?.mode;
			if (mode === NAV) return bool(settings.advanced_hud_enabled_nav);
			if (mode === SCM) return bool(settings.advanced_hud_enabled_scm);
			return "unknown";
		}
		case "power_engines":
			return power ? bool(power.engines) : "unavailable";
		case "power_weapons":
			return power ? bool(power.weapons) : "unavailable";
		case "power_shields":
			return power ? bool(power.shield_generators) : "unavailable";
		case "power_main":
			return power ? bool(power.powerplants) : "unavailable";
		case "doors_closed":
			return doors ? enumPair(doors.open_state, "DOOR_OPEN_STATE_CLOSED", "DOOR_OPEN_STATE_OPENED") : "unavailable";
		case "doors_locked":
			return doors ? enumPair(doors.lock_state, "DOOR_LOCK_STATE_LOCKED", "DOOR_LOCK_STATE_UNLOCKED") : "unavailable";
	}
}
