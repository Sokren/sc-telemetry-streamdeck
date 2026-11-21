import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadSettings, saveSettings } from "../../src/web/config.js";

const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "sc-cfg-"));
	dirs.push(d);
	return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("réglages de l'appli web", () => {
	test("premier lancement : port 8743, réseau local coupé, jeton long, fichier créé", () => {
		const dir = path.join(tmp(), "SC Telemetry Deck");
		const s = loadSettings(dir);
		expect(s.port).toBe(8743);
		expect(s.lan).toBe(false);
		expect(s.token.length).toBeGreaterThanOrEqual(32);
		expect(JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf-8"))).toEqual(s);
	});

	test("relecture → même jeton ; deux installations → jetons différents", () => {
		const dir = tmp();
		expect(loadSettings(dir).token).toBe(loadSettings(dir).token);
		expect(loadSettings(tmp()).token).not.toBe(loadSettings(dir).token);
	});

	test("champ manquant complété, champs présents gardés", () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ port: 9000, token: "x".repeat(40) }));
		expect(loadSettings(dir)).toEqual({ port: 9000, lan: false, token: "x".repeat(40) });
	});

	test("valeurs invalides remplacées (port hors limites, jeton trop court)", () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ port: 70000, lan: "oui", token: "court" }));
		const s = loadSettings(dir);
		expect(s.port).toBe(8743);
		expect(s.lan).toBe(false);
		expect(s.token.length).toBeGreaterThanOrEqual(32);
	});

	test("accès réseau : toutes les interfaces et carte choisie gardées ; saveSettings réécrit", () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ port: 9000, lan: true, lanAll: true, lanNetwork: "Wi-Fi", token: "x".repeat(40) }));
		const s = loadSettings(dir);
		expect(s).toEqual({ port: 9000, lan: true, lanAll: true, lanNetwork: "Wi-Fi", token: "x".repeat(40) });
		s.lanAll = false;
		saveSettings(dir, s);
		expect(loadSettings(dir).lanAll).toBe(false);
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ lanAll: "oui", lanNetwork: 3 }));
		const bad = loadSettings(dir);
		expect(bad.lanAll).toBeUndefined();
		expect(bad.lanNetwork).toBeUndefined();
	});

	test("fichier corrompu → réglages neufs, ancien conservé en .bak", () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, "settings.json"), "{pas du json");
		const s = loadSettings(dir);
		expect(s.port).toBe(8743);
		expect(fs.readFileSync(path.join(dir, "settings.json.bak"), "utf-8")).toBe("{pas du json");
	});
});
