import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionSource } from "../catalog/source.js";
import type { GameApi } from "../game/types.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import type { WebSettings } from "./config.js";
import { createHandler, type Route } from "./http.js";
import { MorseControl } from "./morse-control.js";
import { DEFAULT_LAYOUT } from "./layout.js";
import { actionRoutes } from "./routes/actions.js";
import { layoutRoutes } from "./routes/layout.js";
import { morseRoutes } from "./routes/morse.js";
import { shipRoutes } from "./routes/ship.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { vitalRoutes } from "./routes/vitals.js";

/** Ce dont l'appli a besoin ; complété au fil des étapes. */
export type AppDeps = {
	settings: WebSettings;
	version: string;
	/** Version du jeu du schéma / de l'instantané embarqués. */
	schemaVersion: string;
	game: GameApi;
	hub: TelemetryHub;
	source: ActionSource;
	/** Émission morse (par défaut : créée sur `game`). */
	morse?: MorseControl;
	/** Dossier de `swagger-ui-dist` (par défaut : résolu depuis node_modules). */
	swaggerDir?: string;
	/** Contrat OpenAPI (par défaut : `openapi.json` à côté de ce module). */
	openapi?: unknown;
	/** Fichiers statiques de la page (étape suivante). */
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean;
};

export type App = { routes: Route[]; handler: ReturnType<typeof createHandler>; close(): void };

const DOC_FILES: Record<string, string> = {
	"swagger-ui.css": "text/css; charset=utf-8",
	"swagger-ui-bundle.js": "text/javascript; charset=utf-8",
	"favicon-32x32.png": "image/png",
};

const DOCS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SC Telemetry Deck — API</title>
<link rel="icon" href="/api/docs/favicon-32x32.png" />
<link rel="stylesheet" href="/api/docs/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api/docs/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/api/v1/openapi.json", dom_id: "#swagger-ui", persistAuthorization: true });</script>
</body>
</html>
`;

function defaultSwaggerDir(): string {
	const require = createRequire(import.meta.url);
	return path.dirname(require.resolve("swagger-ui-dist/package.json"));
}

function defaultOpenapi(): unknown {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return JSON.parse(fs.readFileSync(path.join(here, "openapi.json"), "utf-8"));
}

/** Construit les routes de l'API publique v1 et le gestionnaire HTTP. */
export function createApp(deps: AppDeps): App {
	const openapi = deps.openapi ?? defaultOpenapi();
	const swaggerDir = deps.swaggerDir ?? defaultSwaggerDir();
	const morse = deps.morse ?? new MorseControl(deps.game);
	// Le flux du jeu reste ouvert tant que l'appli tourne (état toujours à jour pour l'API).
	const unsubscribe = deps.hub.subscribe(() => {});

	const routes: Route[] = [
		{
			method: "GET",
			path: "/api/v1/status",
			handle: async () => {
				const actor = deps.hub.section("actor");
				const live = actor !== undefined || deps.hub.section("vehicle") !== undefined;
				return {
					status: 200,
					json: {
						app: "sc-telemetry-web",
						version: deps.version,
						telemetry: live ? "live" : "no_data",
						character: actor ? "spawned" : "unknown",
						schema: deps.schemaVersion,
					},
				};
			},
		},
		...actionRoutes(deps),
		...vitalRoutes(deps),
		...telemetryRoutes(deps),
		...shipRoutes(deps),
		...morseRoutes({ morse }),
		...layoutRoutes({ hub: deps.hub, game: deps.game, morse, layout: () => DEFAULT_LAYOUT }),
		{ method: "GET", path: "/api/v1/openapi.json", public: true, handle: async () => ({ status: 200, json: openapi }) },
		{
			method: "GET",
			path: "/api/docs",
			public: true,
			handle: async () => ({ status: 200, text: DOCS_PAGE, contentType: "text/html; charset=utf-8" }),
		},
		{
			method: "GET",
			path: "/api/docs/{file}",
			public: true,
			handle: async ({ params }) => {
				const type = DOC_FILES[params.file];
				if (!type) return { status: 404, json: { error: "not_found" } };
				return { status: 200, data: fs.readFileSync(path.join(swaggerDir, params.file)), contentType: type };
			},
		},
	];

	return {
		routes,
		handler: createHandler(routes, () => deps.settings.token, deps.fallback),
		close: unsubscribe,
	};
}
