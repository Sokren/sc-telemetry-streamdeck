// Point d'entrée de l'appli web autonome (dist-web/server.mjs). Indépendant du plugin Stream Deck.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettingsDir } from "./config.js";
import { startServer } from "./server-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const noOpen = process.argv.includes("--no-open");

startServer({
	settingsDir: defaultSettingsDir(),
	dataDir: path.join(here, "data"),
	staticDir: path.join(here, "static"),
	openapiFile: path.join(here, "openapi.json"),
	swaggerDir: path.join(here, "swagger"),
	openBrowser: !noOpen,
	log: (msg) => console.log(msg),
}).then(
	() => console.log("Ctrl+C pour arrêter / Ctrl+C to stop"),
	(err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error("Le port est déjà utilisé : l'appli tourne peut-être déjà. / Port already in use: the app may already be running.");
		} else console.error(err);
		process.exit(1);
	},
);
