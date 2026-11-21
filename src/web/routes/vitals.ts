import type { Lang } from "../../catalog/labels.js";
import { toView } from "../../display/format.js";
import { DISPLAY_VALUES, isDisplayValueId, readValue, type DisplayValueId } from "../../display/values.js";
import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";

export type Vital = {
	id: DisplayValueId;
	label: string;
	available: boolean;
	text: string;
	unit: string;
	percent?: number;
	level: "ok" | "warn" | "bad" | "none";
};

/** Constante du perso telle qu'affichée sur une touche Actor Display, en données. */
export function vitalOf(id: DisplayValueId, actor: Record<string, unknown> | undefined, lang: Lang): Vital {
	const reading = readValue(id, actor);
	const view = toView(id, reading, lang);
	const vital: Vital = { id, label: view.long, available: reading.available, text: view.text, unit: view.unit, level: "none" };
	if (reading.available && reading.kind === "percent") vital.percent = Math.round(reading.percent * 10) / 10;
	if (reading.available && (reading.kind === "percent" || reading.kind === "number")) vital.level = reading.level;
	return vital;
}

export function vitalRoutes(deps: { hub: Pick<TelemetryHub, "section"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/vitals",
			handle: async ({ lang }) => ({ status: 200, json: DISPLAY_VALUES.map((id) => vitalOf(id, deps.hub.section("actor"), lang)) }),
		},
		{
			method: "GET",
			path: "/api/v1/vitals/{id}",
			handle: async ({ params, lang }) =>
				isDisplayValueId(params.id)
					? { status: 200, json: vitalOf(params.id, deps.hub.section("actor"), lang) }
					: { status: 404, json: { error: "not_found" } },
		},
	];
}
