import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { startServer } from "../../src/web/server-core.js";
import { I18N } from "../../src/web/static/i18n.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

async function start() {
	const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-srv-"));
	const s = await startServer({
		settingsDir,
		dataDir: path.join(root, "schema"),
		staticDir: path.join(root, "src/web/static"),
		openapiFile: path.join(root, "src/web/openapi.json"),
		port: 0,
		gameAddress: "127.0.0.1:1",
		openBrowser: false,
		log: () => {},
	});
	stop = async () => {
		await s.close();
		fs.rmSync(settingsDir, { recursive: true, force: true });
	};
	return s;
}

describe("serveur", () => {
	test("démarre sur 127.0.0.1, répond à l'API avec le jeton créé", async () => {
		const s = await start();
		expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		const r = await fetch(`${s.url}/api/v1/status`, { headers: { authorization: `Bearer ${s.token}` } });
		expect(r.status).toBe(200);
		expect(((await r.json()) as { app: string }).app).toBe("sc-telemetry-web");
		expect(s.pageUrl).toBe(`${s.url}/?t=${s.token}`);
	});

	test("page et fichiers statiques servis sans jeton, avec le bon type", async () => {
		const s = await start();
		const page = await fetch(`${s.url}/`);
		expect(page.status).toBe(200);
		expect(page.headers.get("content-type")).toContain("text/html");
		const html = await page.text();
		expect(html).toContain("app.js");
		for (const [file, type] of [["app.js", "javascript"], ["i18n.js", "javascript"], ["style.css", "text/css"]]) {
			const r = await fetch(`${s.url}/${file}`);
			expect(r.status, file).toBe(200);
			expect(r.headers.get("content-type"), file).toContain(type);
		}
		expect((await fetch(`${s.url}/../package.json`)).status).toBe(404);
		expect((await fetch(`${s.url}/nexiste-pas.js`)).status).toBe(404);
	});
});

describe("textes de la page", () => {
	test("chaque texte existe en français et en anglais", () => {
		expect(Object.keys(I18N.fr).sort()).toEqual(Object.keys(I18N.en).sort());
		for (const lang of ["fr", "en"] as const) for (const [k, v] of Object.entries(I18N[lang])) expect(v, `${lang}.${k}`).not.toBe("");
	});

	test("app.js n'utilise que des clés existantes", () => {
		const app = fs.readFileSync(path.join(root, "src/web/static/app.js"), "utf-8");
		const used = [...app.matchAll(/\bt\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);
		expect(used.length).toBeGreaterThan(3);
		for (const k of used) expect(Object.keys(I18N.fr), k).toContain(k);
	});
});

describe("serveur — deux instances", () => {
	test("port déjà pris (exe lancé deux fois, accès réseau activé) : erreur EADDRINUSE, réglages de l'autre intacts", async () => {
		const first = await start();
		const port = Number(new URL(first.url).port);
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-srv2-"));
		try {
			fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ port, lan: true, lanAll: true, token: "y".repeat(40) }));
			const second = startServer({
				settingsDir: dir,
				dataDir: path.join(root, "schema"),
				staticDir: path.join(root, "src/web/static"),
				openapiFile: path.join(root, "src/web/openapi.json"),
				gameAddress: "127.0.0.1:1",
				openBrowser: false,
				log: () => {},
			});
			await expect(second).rejects.toMatchObject({ code: "EADDRINUSE" });
			expect(JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf-8"))).toMatchObject({ lan: true, lanAll: true });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 15_000);
});
