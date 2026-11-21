import type { Route } from "../http.js";
import type { Tile } from "../layout.js";
import { pressTile, renderTile, type TileContext, type TileFeedback } from "../tiles.js";

export type LayoutDeps = Omit<TileContext, "lang"> & {
	/** Grille courante (figée dans cette étape). */
	layout: () => readonly Tile[];
	/** Prévenu après chaque appui de tuile (retour ✔ / ⚠ vers les pages connectées). */
	onFeedback?: (index: number, feedback: TileFeedback) => void;
};

export function layoutRoutes(deps: LayoutDeps): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/layout",
			handle: async ({ lang }) => ({
				status: 200,
				json: { tiles: deps.layout().map((t) => ({ ...t, image: renderTile(t, { ...deps, lang }) })) },
			}),
		},
		{
			method: "POST",
			path: "/api/v1/layout/tiles/{index}/press",
			handle: async ({ params }) => {
				const index = Number(params.index);
				const tile = Number.isInteger(index) ? deps.layout()[index] : undefined;
				if (!tile) return { status: 404, json: { error: "not_found" } };
				const feedback = await pressTile(tile, deps);
				deps.onFeedback?.(index, feedback);
				return { status: 200, json: feedback };
			},
		},
	];
}
