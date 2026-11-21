// Serveur de l'appli web en CommonJS, pour l'exécutable Node SEA (dist-exe/server.cjs).
// Séparé de rollup.config.mjs (plugin Stream Deck) et de rollup.web.config.mjs (dist-web).
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

/** @type {import('rollup').RollupOptions} */
export default {
	input: "src/web/server.ts",
	output: { file: "dist-exe/server.cjs", format: "cjs", inlineDynamicImports: true },
	plugins: [
		typescript({ include: ["src/**/*.ts"], noEmitOnError: true }),
		json(),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
	],
};
