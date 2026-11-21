import type { Route } from "../http.js";
import { parseViewInput, type ViewStore } from "../view.js";

const invalid = { status: 400, json: { error: "invalid_view" } } as const;
const unknown = { status: 404, json: { error: "unknown_view" } } as const;

/** « Ma vue » : liste, création, modification et suppression des vues (chacune enregistrée séparément). */
export function viewsRoutes(deps: { views: ViewStore }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/views",
			handle: async ({ lang }) => ({ status: 200, json: { views: deps.views.list(lang) } }),
		},
		{
			method: "POST",
			path: "/api/v1/views",
			handle: async ({ body, lang }) => {
				const input = parseViewInput(body, lang);
				if (!input) return invalid;
				const view = deps.views.create(input, lang);
				return view === "too_many" ? { status: 409, json: { error: "too_many_views" } } : { status: 201, json: view };
			},
		},
		{
			method: "PUT",
			path: "/api/v1/views/{id}",
			handle: async ({ body, lang, params }) => {
				const input = parseViewInput(body, lang);
				if (!input) return invalid;
				const view = deps.views.update(params.id, input, lang);
				return view === "unknown" ? unknown : { status: 200, json: view };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/views/{id}",
			handle: async ({ lang, params }) => {
				const result = deps.views.remove(params.id, lang);
				if (result === "unknown") return unknown;
				if (result === "last") return { status: 409, json: { error: "last_view" } };
				return { status: 204 };
			},
		},
	];
}
