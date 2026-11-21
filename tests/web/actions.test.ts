import { afterEach, describe, expect, test } from "vitest";
import type { TriggerRequest } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const ACTIONS = [
	{ action_name: "emote_wave", category: "player_emotes" },
	{ action_name: "v_lights_on", category: "lights_controller" },
	{ action_name: "v_invoke_ping", category: "spaceship_radar", holdable: true },
	{ action_name: "v_self_destruct", category: "spaceship_general" },
];
const ACTOR_FRAME = {
	actor: {
		vitals: { oxygen: { current: 1, max: 1 }, thirst: { current: 40, max: 100 }, body_temperature: { current: 36.5, max: 100 }, heart_rate: 70 },
		environment: { breathable_atmosphere: true },
	},
};

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});
async function start(...args: Parameters<typeof startTestServer>) {
	const s = await startTestServer(...args);
	servers.push(s);
	return s;
}
const waitFor = async (check: () => Promise<boolean>) => {
	for (let i = 0; i < 40 && !(await check()); i++) await new Promise((r) => setTimeout(r, 50));
};

describe("GET /api/v1/actions", () => {
	test("actions du jeu groupées, libellés selon la langue, sans action dangereuse", async () => {
		const s = await start({ game: { actions: ACTIONS } });
		const fr = await s.call("GET", "/api/v1/actions?lang=fr");
		expect(fr.status).toBe(200);
		validateResponse("/api/v1/actions", "GET", 200, fr.body);
		expect(fr.body.live).toBe(true);
		const names = fr.body.groups.flatMap((g: { actions: { name: string }[] }) => g.actions.map((a) => a.name));
		expect(names.sort()).toEqual(["emote_wave", "v_invoke_ping", "v_lights_on"]);
		expect(JSON.stringify(fr.body)).toContain("Faire coucou");
		const en = await s.call("GET", "/api/v1/actions?lang=en");
		expect(JSON.stringify(en.body)).toContain("Wave");
		expect(JSON.stringify(en.body)).toContain('"holdable":true');
	});

	test("jeu absent → instantané (live: false)", async () => {
		const s = await start({ game: null });
		const r = await s.call("GET", "/api/v1/actions");
		expect(r.status).toBe(200);
		expect(r.body.live).toBe(false);
		expect(JSON.stringify(r.body)).not.toContain("v_self_destruct");
	});
});

describe("POST /api/v1/actions/{name}/trigger", () => {
	test("déclenche exactement l'action demandée", async () => {
		const received: TriggerRequest[] = [];
		const s = await start({ game: { trigger: (req) => (received.push(req), { status: 1 }) } });
		const r = await s.call("POST", "/api/v1/actions/emote_wave/trigger");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/actions/{name}/trigger", "POST", 200, r.body);
		expect(received).toEqual([{ action_name: "emote_wave" }]);
	});

	test("action dangereuse → 403, rien envoyé", async () => {
		const received: TriggerRequest[] = [];
		const s = await start({ game: { trigger: (req) => (received.push(req), { status: 1 }) } });
		for (const name of ["v_self_destruct", "v_eject", "v_open_all_doors", "v_toggle_all_doorlocks"]) {
			const r = await s.call("POST", `/api/v1/actions/${name}/trigger`);
			expect(r.status, name).toBe(403);
			validateResponse("/api/v1/actions/{name}/trigger", "POST", 403, r.body);
		}
		expect(received).toEqual([]);
	});

	test("refus du jeu ou jeu absent → 502 avec la raison", async () => {
		const s = await start({ game: { trigger: () => ({ status: 3, message: "carte inactive" }) } });
		const r = await s.call("POST", "/api/v1/actions/emote_wave/trigger");
		expect(r.status).toBe(502);
		validateResponse("/api/v1/actions/{name}/trigger", "POST", 502, r.body);
		expect(r.body).toMatchObject({ ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_MAP_INACTIVE", message: "carte inactive" });
		const off = await start({ game: null });
		const r2 = await off.call("POST", "/api/v1/actions/emote_wave/trigger");
		expect(r2.status).toBe(502);
		expect(r2.body.ok).toBe(false);
	});
});

describe("constantes et télémétrie brute", () => {
	test("sans flux : constantes indisponibles, télémétrie 404", async () => {
		const s = await start({ game: null });
		const v = await s.call("GET", "/api/v1/vitals");
		expect(v.status).toBe(200);
		validateResponse("/api/v1/vitals", "GET", 200, v.body);
		expect(v.body).toHaveLength(13);
		expect(v.body.every((x: { available: boolean; text: string }) => !x.available && x.text === "—")).toBe(true);
		const t = await s.call("GET", "/api/v1/telemetry/actor");
		expect(t.status).toBe(404);
		validateResponse("/api/v1/telemetry/{section}", "GET", 404, t.body);
	});

	test("avec une image du flux : valeurs, niveaux, section brute", async () => {
		const s = await start({ game: { frames: [ACTOR_FRAME], holdOpen: true } });
		await waitFor(async () => (await s.call("GET", "/api/v1/telemetry/actor")).status === 200);
		const ox = await s.call("GET", "/api/v1/vitals/oxygen?lang=fr");
		expect(ox.status).toBe(200);
		validateResponse("/api/v1/vitals/{id}", "GET", 200, ox.body);
		expect(ox.body).toEqual({ id: "oxygen", label: "Oxygène", available: true, text: "100", unit: "%", percent: 100, level: "ok" });
		const th = await s.call("GET", "/api/v1/vitals/thirst");
		expect(th.body).toMatchObject({ percent: 40, level: "warn" });
		const hr = await s.call("GET", "/api/v1/vitals/heart_rate?lang=en");
		expect(hr.body).toMatchObject({ label: "Heart rate", text: "70", unit: "bpm", level: "none" });
		expect(hr.body).not.toHaveProperty("percent");
		const raw = await s.call("GET", "/api/v1/telemetry/actor");
		expect(raw.body).toEqual(ACTOR_FRAME.actor);
	});

	test("donnée inconnue → 404", async () => {
		const s = await start({ game: null });
		const r = await s.call("GET", "/api/v1/vitals/inconnue");
		expect(r.status).toBe(404);
		validateResponse("/api/v1/vitals/{id}", "GET", 404, r.body);
	});
});
