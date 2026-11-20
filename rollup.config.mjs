import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.sokren.sc-telemetry.sdPlugin";

/** `schema/` reste la seule source : on copie le schéma et l'instantané dans le plugin à chaque construction. */
const schemaFiles = ["sc_extrait.desc", "actions.json"];

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		},
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		{
			name: "copy-schema",
			buildStart: function () {
				fs.mkdirSync(`${sdPlugin}/data`, { recursive: true });
				for (const f of schemaFiles) {
					this.addWatchFile(`schema/${f}`);
					fs.copyFileSync(`schema/${f}`, `${sdPlugin}/data/${f}`);
				}
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined,
			include: ["src/**/*.ts"],
		}),
		json(),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true,
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
};

export default config;
