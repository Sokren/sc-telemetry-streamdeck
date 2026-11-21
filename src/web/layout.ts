/** Types de tuiles de la page : les mêmes que les actions du plugin, avec les mêmes réglages. */
export type TileType = "actor-action" | "actor-display" | "ship-toggle" | "ship-action" | "morse";

export type Tile = { type: TileType; settings: Record<string, unknown> };

export const TILE_TYPES: readonly TileType[] = ["actor-action", "actor-display", "ship-toggle", "ship-action", "morse"];

/** Grille du premier lancement (validée par Remi). */
export const DEFAULT_LAYOUT: readonly Tile[] = [
	{ type: "ship-toggle", settings: { function: "gear" } },
	{ type: "ship-toggle", settings: { function: "lights" } },
	{ type: "ship-toggle", settings: { function: "decoupled" } },
	{ type: "ship-toggle", settings: { function: "master_nav" } },
	{ type: "ship-toggle", settings: { function: "power_engines" } },
	{ type: "actor-display", settings: { value: "oxygen" } },
	{ type: "actor-display", settings: { value: "health" } },
	{ type: "actor-display", settings: { value: "body_temperature" } },
	{ type: "actor-action", settings: { action: "emote_wave" } },
	{ type: "morse", settings: { text: "SOS" } },
];
