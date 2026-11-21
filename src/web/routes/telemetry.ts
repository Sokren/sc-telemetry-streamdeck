import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";

/** Dernière section brute du flux (`actor`, `vehicle`…), si elle a moins de 3 s. */
export function telemetryRoutes(deps: { hub: Pick<TelemetryHub, "section"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/telemetry/{section}",
			handle: async ({ params }) => {
				const section = deps.hub.section(params.section);
				return section ? { status: 200, json: section } : { status: 404, json: { error: "no_data" } };
			},
		},
	];
}
