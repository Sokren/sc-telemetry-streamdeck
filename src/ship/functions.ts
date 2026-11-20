/** Fonctions vaisseau avec état, dans l'ordre de la liste du panneau. */
export const SHIP_FUNCTION_IDS = [
	"gear",
	"lights",
	"vtol",
	"transform",
	"decoupled",
	"gsafe",
	"proximity",
	"esp",
	"advanced_hud",
	"night_vision",
	"master_nav",
	"power_engines",
	"power_weapons",
	"power_shields",
	"power_main",
	"doors_closed",
	"doors_locked",
] as const;

export type ShipFunctionId = (typeof SHIP_FUNCTION_IDS)[number];

/**
 * Commandes du jeu d'une fonction. `onlyOn` : la commande « off » et la bascule sont dangereuses
 * (coupure totale, ouverture / déverrouillage des portes) ; la touche agit toujours comme « On ».
 */
export type ShipFunction = { id: ShipFunctionId; on?: string; off?: string; toggle?: string; onlyOn: boolean };

const fn = (id: ShipFunctionId, on: string | undefined, off: string | undefined, toggle: string | undefined): ShipFunction => ({
	id,
	on,
	off,
	toggle,
	onlyOn: false,
});
const onlyOn = (id: ShipFunctionId, on: string): ShipFunction => ({ id, on, off: undefined, toggle: undefined, onlyOn: true });

export const SHIP_FUNCTIONS: readonly ShipFunction[] = [
	fn("gear", "v_deploy_landing_system", "v_retract_landing_system", "v_toggle_landing_system"),
	fn("lights", "v_lights_on", "v_lights_off", "v_lights"),
	fn("vtol", "v_vtol_on", "v_vtol_off", "v_vtol_toggle"),
	fn("transform", "v_transform_deploy", "v_transform_retract", "v_transform_cycle"),
	fn("decoupled", "v_ifcs_vector_decoupling_on", "v_ifcs_vector_decoupling_off", "v_ifcs_vector_decoupling_toggle"),
	fn("gsafe", "v_ifcs_gsafe_on", "v_ifcs_gsafe_off", "v_ifcs_toggle_gforce_safety"),
	fn("proximity", "v_ifcs_proximity_assist_on", "v_ifcs_proximity_assist_off", "v_ifcs_proximity_assist_toggle"),
	fn("esp", undefined, undefined, "v_ifcs_toggle_esp"),
	fn("advanced_hud", "v_flight_advanced_hud_on", "v_flight_advanced_hud_off", "v_flight_advanced_hud_toggle"),
	fn("night_vision", "v_light_amplification_on", "v_light_amplification_off", "v_light_amplification_toggle"),
	fn("master_nav", "v_master_mode_set_nav", "v_master_mode_set_scm", "v_master_mode_cycle"),
	fn("power_engines", "v_power_set_thrusters_on", "v_power_set_thrusters_off", "v_power_toggle_thrusters"),
	fn("power_weapons", "v_power_set_weapons_on", "v_power_set_weapons_off", "v_power_toggle_weapons"),
	fn("power_shields", "v_power_set_shields_on", "v_power_set_shields_off", "v_power_toggle_shields"),
	onlyOn("power_main", "v_power_set_on"),
	onlyOn("doors_closed", "v_close_all_doors"),
	onlyOn("doors_locked", "v_lock_all_doors"),
];

/** Fonction par identifiant ; identifiant inconnu → train d'atterrissage. */
export function shipFunction(id: unknown): ShipFunction {
	return SHIP_FUNCTIONS.find((f) => f.id === id) ?? SHIP_FUNCTIONS[0];
}
