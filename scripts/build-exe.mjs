// Fabrique dist/sc-telemetry-web.exe : un seul fichier, sans Node.js à installer (Node SEA).
// Étapes : appli web construite (dist-web), serveur en CommonJS, blob SEA avec les fichiers intégrés,
// copie de node.exe, injection du blob (postject).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
const assets = JSON.parse(fs.readFileSync("src/web/sea-assets.json", "utf-8"));

run("npx", ["rollup", "-c", "rollup.web.config.mjs"]);
run("npx", ["rollup", "-c", "rollup.sea.config.mjs"]);

for (const key of assets) if (!fs.existsSync(path.join("dist-web", key))) throw new Error(`Fichier manquant / missing file: dist-web/${key}`);
fs.writeFileSync(
	"dist-exe/sea-config.json",
	JSON.stringify(
		{
			main: "dist-exe/server.cjs",
			output: "dist-exe/sea-prep.blob",
			disableExperimentalSEAWarning: true,
			useSnapshot: false,
			useCodeCache: false,
			assets: Object.fromEntries(assets.map((key) => [key, `dist-web/${key}`])),
		},
		null,
		2,
	),
);
execFileSync(process.execPath, ["--experimental-sea-config", "dist-exe/sea-config.json"], { stdio: "inherit" });

fs.mkdirSync("dist", { recursive: true });
const exe = path.join("dist", "sc-telemetry-web.exe");
fs.copyFileSync(process.execPath, exe);
run("npx", ["postject", exe, "NODE_SEA_BLOB", "dist-exe/sea-prep.blob", "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
console.log(`\nOK : ${exe} (${Math.round(fs.statSync(exe).size / 1e6)} Mo)`);
