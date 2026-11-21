import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { send } from "./http.js";

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

/**
 * Sert les fichiers de la page (sans jeton : ils ne contiennent aucune donnée du jeu).
 * Seuls les fichiers présents dans `dir` au démarrage sont servis ; `/` → `index.html`.
 */
export function staticFiles(dir: string): (req: IncomingMessage, res: ServerResponse) => boolean {
	const files = new Map<string, string>();
	for (const name of fs.readdirSync(dir)) {
		const type = TYPES[path.extname(name)];
		if (type) files.set(`/${name}`, type);
	}
	return (req, res) => {
		if (req.method !== "GET") return false;
		const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
		const name = pathname === "/" ? "/index.html" : pathname;
		const type = files.get(name);
		if (!type) return false;
		send(res, { status: 200, data: fs.readFileSync(path.join(dir, name.slice(1))), contentType: type });
		return true;
	};
}
