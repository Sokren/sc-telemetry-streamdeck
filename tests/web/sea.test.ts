import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ASSET_KEYS, prepareFiles } from "../../src/web/sea.js";

const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "sc-sea-"));
	dirs.push(d);
	return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** Faux contenu intégré à l'exe : chaque clé renvoie son propre nom. */
const getAsset = (key: string) => new TextEncoder().encode(`intégré:${key}`).buffer as ArrayBuffer;
const read = (p: string) => fs.readFileSync(p, "utf-8");

describe("fichiers de l'appli", () => {
	test("hors exécutable : dossiers à côté du serveur", () => {
		const here = tmp();
		const files = prepareFiles({ isSea: false, scriptDir: here, exeDir: "x", cacheDir: "x", version: "0.0.0", getAsset });
		expect(files).toEqual({
			dataDir: path.join(here, "data"),
			staticDir: path.join(here, "static"),
			openapiFile: path.join(here, "openapi.json"),
			swaggerDir: path.join(here, "swagger"),
		});
	});

	test("exécutable : tous les fichiers intégrés déposés dans le cache de la version", () => {
		const cache = tmp();
		const files = prepareFiles({ isSea: true, scriptDir: "x", exeDir: tmp(), cacheDir: cache, version: "0.3.1", getAsset });
		const root = path.join(cache, "0.3.1");
		expect(files.staticDir).toBe(path.join(root, "static"));
		for (const key of ASSET_KEYS) expect(read(path.join(root, key)), key).toBe(`intégré:${key}`);
		expect(read(path.join(files.dataDir, "sc_extrait.desc"))).toBe("intégré:data/sc_extrait.desc");
	});

	test("liste des fichiers intégrés : page, contrat, schéma, Swagger", () => {
		expect(ASSET_KEYS).toEqual(
			expect.arrayContaining([
				"static/index.html", "static/app.js", "static/i18n.js", "static/style.css", "openapi.json",
				"data/sc_extrait.desc", "data/actions.json", "swagger/swagger-ui-bundle.js", "swagger/swagger-ui.css",
			]),
		);
	});

	test("schéma et liste d'actions posés à côté de l'exe : ils remplacent ceux intégrés", () => {
		const exeDir = tmp();
		fs.writeFileSync(path.join(exeDir, "sc_extrait.desc"), "schéma du patch");
		const files = prepareFiles({ isSea: true, scriptDir: "x", exeDir, cacheDir: tmp(), version: "0.3.1", getAsset });
		expect(read(path.join(files.dataDir, "sc_extrait.desc"))).toBe("schéma du patch");
		expect(read(path.join(files.dataDir, "actions.json"))).toBe("intégré:data/actions.json");
	});

	test("relancer l'exe réécrit les fichiers (une mise à jour ne garde pas d'anciens fichiers)", () => {
		const cache = tmp();
		const opts = { isSea: true, scriptDir: "x", exeDir: tmp(), cacheDir: cache, version: "0.3.1", getAsset };
		const files = prepareFiles(opts);
		fs.writeFileSync(path.join(files.staticDir, "app.js"), "ancien");
		prepareFiles(opts);
		expect(read(path.join(files.staticDir, "app.js"))).toBe("intégré:static/app.js");
	});
});
