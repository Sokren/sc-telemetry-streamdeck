import { exec } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ActionSource, readSnapshot } from "../catalog/source.js";
import { createGameApi } from "../game/create.js";
import { TelemetryHub } from "../telemetry/hub.js";
import { createApp } from "./app.js";
import { loadSettings } from "./config.js";
import { staticFiles } from "./static-files.js";

export const VERSION = "0.3.1";

export type ServerOptions = {
	settingsDir: string;
	/** Dossier contenant `sc_extrait.desc` et `actions.json`. */
	dataDir: string;
	staticDir: string;
	openapiFile: string;
	swaggerDir?: string;
	/** Port imposé (0 = libre, pour les tests) ; sinon celui des réglages. */
	port?: number;
	gameAddress?: string;
	openBrowser: boolean;
	log: (msg: string) => void;
};

export type RunningServer = { url: string; pageUrl: string; token: string; close(): Promise<void> };

/** Ouvre une adresse dans le navigateur par défaut (Windows). */
function openInBrowser(url: string): void {
	exec(`start "" "${url}"`, { windowsHide: true });
}

/** Démarre l'appli web : connexion au jeu, API, page. N'écoute que sur 127.0.0.1 (étape 1). */
export async function startServer(o: ServerOptions): Promise<RunningServer> {
	const settings = loadSettings(o.settingsDir);
	const game = createGameApi(path.join(o.dataDir, "sc_extrait.desc"), o.log, o.gameAddress);
	const hub = new TelemetryHub(game);
	const snapshotFile = path.join(o.dataDir, "actions.json");
	let schemaVersion = "?";
	try {
		schemaVersion = String(JSON.parse(fs.readFileSync(snapshotFile, "utf-8")).game_version ?? "?");
	} catch {
		/* instantané absent : version inconnue */
	}
	const app = createApp({
		settings,
		version: VERSION,
		schemaVersion,
		game,
		hub,
		source: new ActionSource(game, () => readSnapshot(snapshotFile)),
		openapi: JSON.parse(fs.readFileSync(o.openapiFile, "utf-8")),
		swaggerDir: o.swaggerDir,
		fallback: staticFiles(o.staticDir),
	});
	const server = http.createServer(app.handler);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(o.port ?? settings.port, "127.0.0.1", () => resolve());
	});
	const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
	const pageUrl = `${url}/?t=${settings.token}`;
	o.log(`SC Telemetry Deck ${VERSION} — page : ${pageUrl}`);
	o.log(`API : ${url}/api/docs`);
	if (o.openBrowser) openInBrowser(pageUrl);
	return {
		url,
		pageUrl,
		token: settings.token,
		async close() {
			app.close();
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
			game.close();
		},
	};
}
