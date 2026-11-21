import { exec } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ActionSource, readSnapshot } from "../catalog/source.js";
import { createGameApi } from "../game/create.js";
import { TelemetryHub } from "../telemetry/hub.js";
import { createApp } from "./app.js";
import { loadSettings, saveSettings } from "./config.js";
import { isLoopback, LanManager } from "./lan.js";
import { staticFiles } from "./static-files.js";

export const VERSION = "0.3.3";

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

/**
 * Écoute HTTP sur plusieurs adresses (même port, même gestionnaire). Changer d'adresses ferme les écoutes retirées
 * (leurs connexions sont coupées un peu plus tard, le temps de répondre à la requête en cours) et ouvre les nouvelles.
 */
class Listener {
	readonly #servers = new Map<string, http.Server>();
	port = 0;

	constructor(
		private readonly handler: http.RequestListener,
		private readonly wantedPort: number,
	) {}

	/**
	 * Écoute sur exactement ces adresses. `false` : une adresse réseau n'a pas pu être ouverte (le PC reste
	 * joignable) ; erreur levée (avec son `code`) : 127.0.0.1 lui-même n'a pas pu être ouvert (autre instance…).
	 */
	async listen(hosts: string[]): Promise<boolean> {
		const removed: http.Server[] = [];
		for (const [host, server] of [...this.#servers]) {
			if (hosts.includes(host)) continue;
			this.#servers.delete(host);
			server.close();
			server.closeIdleConnections();
			removed.push(server);
		}
		// Connexions encore ouvertes sur les écoutes retirées (pages, flux) coupées un peu plus tard, une fois la
		// nouvelle écoute en place : la réponse en cours (ce réglage même) part d'abord.
		const cutLater = () => {
			if (!removed.length) return;
			const timer = setTimeout(() => removed.forEach((server) => server.closeAllConnections()), 1500);
			timer.unref?.();
		};
		// Le PC d'abord : s'il échoue, c'est l'appli entière qui ne peut pas tourner.
		const ordered = [...hosts].sort((a, b) => Number(b === "127.0.0.1") - Number(a === "127.0.0.1"));
		const opened: string[] = [];
		try {
			for (const host of ordered) {
				if (this.#servers.has(host)) continue;
				const server = http.createServer(this.handler);
				try {
					await this.#open(server, host);
				} catch (e) {
					if (host === "127.0.0.1") throw e;
					for (const h of opened.filter((x) => x !== "127.0.0.1")) {
						this.#servers.get(h)?.close();
						this.#servers.delete(h);
					}
					return false;
				}
				this.#servers.set(host, server);
				opened.push(host);
			}
			return true;
		} finally {
			cutLater();
		}
	}

	/** Ouvre une écoute ; adresse encore occupée par l'écoute qu'on vient de fermer → quelques essais. */
	async #open(server: http.Server, host: string): Promise<void> {
		for (let attempt = 0; ; attempt++) {
			try {
				await new Promise<void>((resolve, reject) => {
					server.once("error", reject);
					server.listen(this.port || this.wantedPort, host, () => {
						server.off("error", reject);
						resolve();
					});
				});
				this.port ||= (server.address() as { port: number }).port;
				return;
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt >= 4) throw e;
				await new Promise((r) => setTimeout(r, 100));
			}
		}
	}

	async close(): Promise<void> {
		await Promise.all(
			[...this.#servers.values()].map((server) => {
				server.closeAllConnections();
				return new Promise<void>((r) => server.close(() => r()));
			}),
		);
		this.#servers.clear();
	}
}

/**
 * Démarre l'appli web : connexion au jeu, API, page. Écoute sur 127.0.0.1, plus le réseau local si l'accès
 * tablette / téléphone est activé (réglages enregistrés).
 */
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
		viewFile: path.join(o.settingsDir, "view.json"),
		saveSettings: () => saveSettings(o.settingsDir, settings),
		lanFactory: (s, save) => new LanManager({ settings: s, save, listen: (hosts) => listener.listen(hosts), port: () => listener.port }),
		fallback: staticFiles(o.staticDir),
	});
	// Accès réseau coupé : rien d'autre que le PC, même si une écoute réseau n'est pas encore fermée.
	const guarded: http.RequestListener = (req, res) => {
		if (!settings.lan && !isLoopback(req.socket.remoteAddress)) {
			res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
			res.end(JSON.stringify({ error: "lan_disabled" }));
			return;
		}
		app.handler(req, res);
	};
	const listener = new Listener(guarded, o.port ?? settings.port);
	try {
		await app.lan.start();
	} catch (e) {
		app.close();
		game.close();
		throw e;
	}
	const url = `http://127.0.0.1:${listener.port}`;
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
			await listener.close();
			game.close();
		},
	};
}
