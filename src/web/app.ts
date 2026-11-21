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
import { isLoopback, LanManager } from "./lan.js";
import { MorseControl } from "./morse-control.js";
import { CountermeasureTracker } from "../display/countermeasures.js";
import { ActionCapability } from "./capability.js";
import { EventHub } from "./events.js";
import { DEFAULT_LAYOUT } from "./layout.js";
import { actionRoutes } from "./routes/actions.js";
import { lanRoutes } from "./routes/lan.js";
import { layoutRoutes } from "./routes/layout.js";
import { morseRoutes } from "./routes/morse.js";
import { panelRoutes } from "./routes/panels.js";
import { shipRoutes } from "./routes/ship.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { viewsRoutes } from "./routes/view.js";
import { vitalRoutes } from "./routes/vitals.js";
import { ViewStore } from "./view.js";

/** Ce dont l'appli a besoin ; complété au fil des étapes. */
export type AppDeps = {
	settings: WebSettings;
	version: string;
	/** Version du jeu du schéma / de l'instantané embarqués. */
	schemaVersion: string;
	game: GameApi;
	hub: TelemetryHub;
	source: ActionSource;
	/** Le jeu accepte-t-il les actions ? (par défaut : vérifié sur `game` toutes les 30 s). */
	capability?: ActionCapability;
	/** Émission morse (par défaut : créée sur `game`). */
	morse?: MorseControl;
	/** Dossier de `swagger-ui-dist` (par défaut : résolu depuis node_modules). */
	swaggerDir?: string;
	/** Contrat OpenAPI (par défaut : `openapi.json` à côté de ce module). */
	openapi?: unknown;
	/** Fichier des vues « Ma vue » (`view.json`) ; absent → vues gardées en mémoire seulement. */
	viewFile?: string;
	/** Réécrit `settings.json` (par défaut : rien, réglages en mémoire). */
	saveSettings?: () => void;
	/** Accès réseau local (par défaut : sans effet, écoute gérée par le serveur réel). */
	lanFactory?: (settings: WebSettings, save: () => void) => LanManager;
	/** L'appel vient-il du PC ? (par défaut : adresse distante locale). */
	isLocal?: (req: IncomingMessage) => boolean;
	/** Fichiers statiques de la page (étape suivante). */
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean;
};

export type App = { routes: Route[]; handler: ReturnType<typeof createHandler>; lan: LanManager; close(): void };

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
<script>
// Le jeton mémorisé par la page de l'appli (même origine) est repris automatiquement : pas besoin de « Authorize ».
const ui = SwaggerUIBundle({
	url: "/api/v1/openapi.json",
	dom_id: "#swagger-ui",
	persistAuthorization: true,
	// Barre de recherche : filtre les sections (General, Actions, Character, Ship…).
	filter: true,
	onComplete: () => {
		let token = null;
		try { token = localStorage.getItem("sctd-token"); } catch (e) { /* stockage indisponible */ }
		if (token) ui.preauthorizeApiKey("bearerAuth", token);
	},
});
</script>
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
	// Le flux du jeu reste ouvert tant que l'appli tourne (état toujours à jour pour l'API) ; il nourrit le suivi
	// des contre-mesures (plus grand stock vu par modèle de vaisseau), même sans page ouverte.
	const countermeasures = new CountermeasureTracker();
	const unsubscribe = deps.hub.subscribe(() =>
		countermeasures.observe({ weapons: deps.hub.section("weapons"), vehicle: deps.hub.section("vehicle"), actor: deps.hub.section("actor") }),
	);
	const layout = () => DEFAULT_LAYOUT;
	const capability = deps.capability ?? new ActionCapability(deps.game);
	const status = () => {
		const actor = deps.hub.section("actor");
		const live = actor !== undefined || deps.hub.section("vehicle") !== undefined;
		return {
			app: "sc-telemetry-web",
			version: deps.version,
			telemetry: live ? "live" : "no_data",
			character: actor ? "spawned" : "unknown",
			schema: deps.schemaVersion,
			actions: capability.value,
		};
	};
	const save = deps.saveSettings ?? (() => {});
	const lan = deps.lanFactory?.(deps.settings, save) ?? new LanManager({ settings: deps.settings, save, listen: async () => true, cards: () => [] });
	const views = new ViewStore(deps.viewFile);
	const events = new EventHub({ hub: deps.hub, game: deps.game, morse, layout, status, countermeasures, views: (lang) => ({ views: views.list(lang) }) });
	// Vue enregistrée (depuis n'importe quel appareil) → renvoyée à toutes les pages connectées.
	const stopView = views.onChange(() => events.refresh());
	// Changement de capacité (jeu relancé dans une autre version) → état renvoyé aux pages connectées.
	const stopCapability = capability.onChange(() => events.refresh());
	capability.start();

	const routes: Route[] = [
		{
			method: "GET",
			path: "/api/v1/status",
			handle: async () => ({ status: 200, json: status() }),
		},
		{
			method: "GET",
			path: "/api/v1/events",
			handle: async ({ req, res, lang }) => {
				events.connect(req, res, lang);
				return { stream: true };
			},
		},
		...actionRoutes(deps),
		...vitalRoutes(deps),
		...telemetryRoutes(deps),
		...shipRoutes(deps),
		...panelRoutes({ hub: deps.hub, countermeasures }),
		...morseRoutes({ morse }),
		...viewsRoutes({ views }),
		...lanRoutes({
			lan,
			isLocal: deps.isLocal ?? ((req) => isLoopback(req.socket.remoteAddress)),
			remotes: () => events.remotes(),
			onToken: () => events.close(),
		}),
		...layoutRoutes({ hub: deps.hub, game: deps.game, morse, layout, onFeedback: (i, f) => events.feedback(i, f) }),
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
		lan,
		handler: createHandler(routes, () => deps.settings.token, deps.fallback),
		close: () => {
			stopCapability();
			stopView();
			lan.stop();
			capability.stop();
			events.close();
			unsubscribe();
		},
	};
}
