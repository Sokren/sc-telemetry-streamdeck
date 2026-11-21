import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";
import { characterOf, shipStatusOf } from "../panels.js";

/** Données des onglets Personnage et Vaisseau de la page, en lecture pour tout logiciel. */
export function panelRoutes(deps: { hub: Pick<TelemetryHub, "section"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/character",
			handle: async ({ lang }) => ({ status: 200, json: characterOf(deps.hub.section("actor"), lang) }),
		},
		{
			method: "GET",
			path: "/api/v1/ship/status",
			handle: async ({ lang }) => ({ status: 200, json: shipStatusOf(deps.hub.section("vehicle"), deps.hub.section("actor"), lang) }),
		},
	];
}
