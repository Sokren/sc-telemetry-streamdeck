import fs from "node:fs";
import path from "node:path";
import assetKeys from "./sea-assets.json" with { type: "json" };

/**
 * Fichiers intégrés dans `sc-telemetry-web.exe` (clé = chemin relatif dans dist-web). La liste est
 * partagée avec le script de construction (scripts/build-exe.mjs) : les deux ne peuvent pas diverger.
 */
export const ASSET_KEYS: readonly string[] = assetKeys;

/** Fichiers de données qu'on peut remplacer en les posant à côté de l'exe (après un patch du jeu). */
const OVERRIDABLE = ["sc_extrait.desc", "actions.json"];

export type AppFiles = { dataDir: string; staticDir: string; openapiFile: string; swaggerDir: string };

export type PrepareOptions = {
	/** Lancé depuis l'exécutable (Node SEA) ? */
	isSea: boolean;
	/** Dossier du serveur construit (hors exécutable). */
	scriptDir: string;
	/** Dossier de l'exécutable. */
	exeDir: string;
	/** Dossier où déposer les fichiers intégrés (un sous-dossier par version). */
	cacheDir: string;
	version: string;
	getAsset: (key: string) => ArrayBuffer;
};

/**
 * Chemins des fichiers de l'appli. Hors exécutable : à côté du serveur. Dans l'exécutable : les
 * fichiers intégrés sont réécrits à chaque lancement dans `cacheDir/<version>/`, puis un
 * `sc_extrait.desc` ou `actions.json` posé à côté de l'exe remplace celui intégré.
 */
export function prepareFiles(o: PrepareOptions): AppFiles {
	const root = o.isSea ? path.join(o.cacheDir, o.version) : o.scriptDir;
	if (o.isSea) {
		for (const key of ASSET_KEYS) {
			const target = path.join(root, key);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, Buffer.from(o.getAsset(key)));
		}
		for (const name of OVERRIDABLE) {
			const local = path.join(o.exeDir, name);
			if (fs.existsSync(local)) fs.copyFileSync(local, path.join(root, "data", name));
		}
	}
	return {
		dataDir: path.join(root, "data"),
		staticDir: path.join(root, "static"),
		openapiFile: path.join(root, "openapi.json"),
		swaggerDir: path.join(root, "swagger"),
	};
}
