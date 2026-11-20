import { action } from "@elgato/streamdeck";
import { SHIP_GROUPS } from "../catalog/dropdown.js";
import { CategoryAction, type CategoryActionDeps } from "./category-action.js";

/** Commandes vaisseau et siège sans état (flight ready, ATC, ping, quantum, modes du siège…). */
@action({ UUID: "com.sokren.sc-telemetry.ship-action" })
export class ShipAction extends CategoryAction {
	constructor(deps: Omit<CategoryActionDeps, "groups">) {
		super({ ...deps, groups: SHIP_GROUPS });
	}
}
