// Construction de l'appli web autonome → dist-web/. Séparée de rollup.config.mjs (plugin Stream Deck).
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const out = "dist-web";
const require = createRequire(import.meta.url);
const swaggerDir = path.dirname(require.resolve("swagger-ui-dist/package.json"));

/** Copie la page, le contrat, le schéma et Swagger UI à côté du serveur construit. */
const copies = [
	["src/web/openapi.json", `${out}/openapi.json`],
	["schema/sc_extrait.desc", `${out}/data/sc_extrait.desc`],
	["schema/actions.json", `${out}/data/actions.json`],
	...["index.html", "app.js", "i18n.js", "style.css"].map((f) => [`src/web/static/${f}`, `${out}/static/${f}`]),
	...["swagger-ui.css", "swagger-ui-bundle.js", "favicon-32x32.png"].map((f) => [path.join(swaggerDir, f), `${out}/swagger/${f}`]),
];

/** @type {import('rollup').RollupOptions} */
export default {
	input: "src/web/server.ts",
	output: { file: `${out}/server.mjs`, format: "es", inlineDynamicImports: true },
	plugins: [
		{
			name: "copy-web-files",
			buildStart() {
				for (const [from, to] of copies) {
					fs.mkdirSync(path.dirname(to), { recursive: true });
					fs.copyFileSync(from, to);
					this.addWatchFile(from);
				}
			},
		},
		typescript({ include: ["src/**/*.ts"], noEmitOnError: true }),
		json(),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
};
