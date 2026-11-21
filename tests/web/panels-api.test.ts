import fs from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8"));

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});
async function start(inShip: boolean) {
	const s = await startTestServer({ game: inShip ? { frames: [titan], holdOpen: true } : null });
	servers.push(s);
	if (inShip) for (let i = 0; i < 40 && (await s.call("GET", "/api/v1/telemetry/vehicle")).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
	return s;
}

describe("GET /api/v1/character", () => {
	test("au siège pilote : position, rôle, constantes ; conforme au contrat", async () => {
		const s = await start(true);
		const r = await s.call("GET", "/api/v1/character?lang=fr");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/character", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: true, locomotion: "seated", crewRoleLabel: "Pilote" });
		expect(r.body.vitals).toHaveLength(13);
	});

	test("jeu fermé : indisponible", async () => {
		const s = await start(false);
		const r = await s.call("GET", "/api/v1/character?lang=en");
		validateResponse("/api/v1/character", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: false, locomotionLabel: "—" });
	});
});

describe("GET /api/v1/ship/status", () => {
	test("Titan : nom, instruments, voyants ; conforme au contrat", async () => {
		const s = await start(true);
		const r = await s.call("GET", "/api/v1/ship/status?lang=en");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/ship/status", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: true, name: "Avenger Titan", landed: true, masterModeLabel: "SCM" });
		expect(r.body.instruments).toHaveLength(12);
		expect(r.body.annunciators).toHaveLength(10);
	});

	test("jeu fermé : indisponible, conforme au contrat", async () => {
		const s = await start(false);
		const r = await s.call("GET", "/api/v1/ship/status");
		validateResponse("/api/v1/ship/status", "GET", 200, r.body);
		expect(r.body.available).toBe(false);
	});
});
