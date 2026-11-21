import fs from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import type { TriggerRequest } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8"));

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});
async function inShip(trigger?: (r: TriggerRequest) => { status: number; message?: string }) {
	const s = await startTestServer({ game: { frames: [titan], holdOpen: true, trigger } });
	servers.push(s);
	for (let i = 0; i < 40 && (await s.call("GET", "/api/v1/telemetry/vehicle")).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
	return s;
}

describe("GET /api/v1/ship/functions", () => {
	test("17 fonctions, état lu sur le Titan, libellés selon la langue", async () => {
		const s = await inShip();
		const r = await s.call("GET", "/api/v1/ship/functions?lang=fr");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/ship/functions", "GET", 200, r.body);
		expect(r.body).toHaveLength(17);
		expect(r.body[0]).toEqual({ id: "gear", name: "Train d'atterrissage", label: "Train", state: "on", word: "SORTI" });
		const doors = r.body.find((f: { id: string }) => f.id === "doors_closed");
		expect(doors).toMatchObject({ state: "unavailable", word: "—" });
	});

	test("une fonction ; inconnue → 404 ; jeu fermé → unknown", async () => {
		const s = await inShip();
		const lights = await s.call("GET", "/api/v1/ship/functions/lights?lang=en");
		validateResponse("/api/v1/ship/functions/{id}", "GET", 200, lights.body);
		expect(lights.body).toMatchObject({ id: "lights", state: "off", word: "OFF" });
		const bad = await s.call("GET", "/api/v1/ship/functions/v_self_destruct");
		expect(bad.status).toBe(404);
		const off = await startTestServer({ game: null });
		servers.push(off);
		expect((await off.call("GET", "/api/v1/ship/functions/gear")).body.state).toBe("unknown");
	});
});

describe("POST /api/v1/ship/functions/{id}/press", () => {
	test("train sorti, bascule → rentrer", async () => {
		const sent: TriggerRequest[] = [];
		const s = await inShip((r) => (sent.push(r), { status: 1 }));
		const r = await s.call("POST", "/api/v1/ship/functions/gear/press", { body: { mode: "toggle" } });
		expect(r.status).toBe(200);
		validateResponse("/api/v1/ship/functions/{id}/press", "POST", 200, r.body);
		expect(r.body).toEqual({ decision: "sent", action: "v_retract_landing_system", ok: true });
		expect(sent).toEqual([{ action_name: "v_retract_landing_system" }]);
	});

	test("déjà dans l'état voulu → noop ; sans corps → bascule", async () => {
		const sent: TriggerRequest[] = [];
		const s = await inShip((r) => (sent.push(r), { status: 1 }));
		const noop = await s.call("POST", "/api/v1/ship/functions/gear/press", { body: { mode: "on" } });
		expect(noop.body).toEqual({ decision: "noop" });
		const def = await s.call("POST", "/api/v1/ship/functions/lights/press");
		expect(def.body).toMatchObject({ decision: "sent", action: "v_lights_on" });
	});

	test("fonction absente du vaisseau → 409, rien envoyé ; mode invalide → 400", async () => {
		const sent: TriggerRequest[] = [];
		const s = await inShip((r) => (sent.push(r), { status: 1 }));
		const r = await s.call("POST", "/api/v1/ship/functions/doors_closed/press", { body: { mode: "off" } });
		expect(r.status).toBe(409);
		validateResponse("/api/v1/ship/functions/{id}/press", "POST", 409, r.body);
		const bad = await s.call("POST", "/api/v1/ship/functions/gear/press", { body: { mode: "boum" } });
		expect(bad.status).toBe(400);
		expect(sent).toEqual([]);
	});

	test("refus : code stable + raison dans la langue demandée (FR / EN)", async () => {
		const s = await inShip();
		const en = await s.call("POST", "/api/v1/ship/functions/doors_closed/press?lang=en", { body: { mode: "on" } });
		expect(en.status).toBe(409);
		validateResponse("/api/v1/ship/functions/{id}/press", "POST", 409, en.body);
		expect(en.body).toEqual({ decision: "refused", code: "unavailable", reason: "This ship does not have this function." });
		const fr = await s.call("POST", "/api/v1/ship/functions/doors_closed/press?lang=fr", { body: { mode: "on" } });
		expect(fr.body).toEqual({ decision: "refused", code: "unavailable", reason: "Ce vaisseau n'a pas cette fonction." });
	});

	test("refus du jeu → 502", async () => {
		const s = await inShip(() => ({ status: 7 }));
		const r = await s.call("POST", "/api/v1/ship/functions/lights/press", { body: { mode: "on" } });
		expect(r.status).toBe(502);
		validateResponse("/api/v1/ship/functions/{id}/press", "POST", 502, r.body);
		expect(r.body).toMatchObject({ decision: "sent", ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_FILTERED" });
	});
});
