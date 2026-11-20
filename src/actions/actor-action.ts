import { action } from "@elgato/streamdeck";
import { ACTOR_GROUPS } from "../catalog/dropdown.js";
import { CategoryAction, type CategoryActionDeps } from "./category-action.js";

/** Actions du personnage : catégories `player` et `player_emotes`. */
@action({ UUID: "com.sokren.sc-telemetry.actor-action" })
export class ActorAction extends CategoryAction {
	constructor(deps: Omit<CategoryActionDeps, "groups">) {
		super({ ...deps, groups: ACTOR_GROUPS });
	}
}
