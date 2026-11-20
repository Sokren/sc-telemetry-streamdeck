/**
 * Actions du jeu jamais envoyées ni proposées par le plugin (aucune confirmation n'existe encore) :
 * autodestruction, éjection, coupure totale, ouverture ou déverrouillage des portes et des sas.
 */
export const DANGEROUS_ACTIONS: ReadonlySet<string> = new Set([
	"v_self_destruct",
	"v_eject",
	"v_emergency_exit",
	"v_power_set_off",
	"v_power_toggle",
	"v_open_all_doors",
	"v_toggle_all_doors",
	"v_unlock_all_doors",
	"v_unlock_all_ports",
	// Bascules de verrouillage : peuvent déverrouiller.
	"v_toggle_all_doorlocks",
	"v_toggle_all_portlocks",
]);
