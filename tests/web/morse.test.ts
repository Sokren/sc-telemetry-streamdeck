import { afterEach, describe, expect, test } from "vitest";
import { MorseControl } from "../../src/web/morse-control.js";
import type { TriggerRequest } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

describe("MorseControl", () => {
	test("bornes et défauts identiques à la touche Morse Code", () => {
		expect(MorseControl.settings({})).toEqual({ text: "SOS", unitMs: 400, repeat: 1 });
		expect(MorseControl.settings({ text: "a", unitMs: 10, repeat: 99 })).toEqual({ text: "a", unitMs: 100, repeat: 10 });
	});

	test("démarre, refuse une 2e émission, s'arrête et remet la torche", async () => {
		const toggles: string[] = [];
		let release!: () => void;
		const m = new MorseControl({ trigger: async (n) => (toggles.push(n), { ok: true }) }, (_ms, signal) => new Promise<void>((r) => {
			release = r;
			signal.addEventListener("abort", () => r(), { once: true });
		}));
		const changes: boolean[] = [];
		m.onChange(() => changes.push(m.playing));
		expect(m.start({ text: "E" })).toBe("started");
		expect(m.playing).toBe(true);
		expect(m.start({ text: "T" })).toBe("busy");
		while (toggles.length < 1) await new Promise((r) => setTimeout(r, 5));
		expect(m.stop()).toBe(true);
		release?.();
		while (m.playing) await new Promise((r) => setTimeout(r, 5));
		expect(toggles).toEqual(["toggle_flashlight", "toggle_flashlight"]); // allumage + remise en état
		expect(changes).toEqual([true, false]);
		expect(m.stop()).toBe(false);
		expect(m.start({ text: "???" })).toBe("empty");
	});
});

describe("API morse", () => {
	let s: TestServer | undefined;
	afterEach(async () => {
		await s?.close();
		s = undefined;
	});

	test("POST 202, 409 si en cours, DELETE 204 puis 404 ; texte vide 422", async () => {
		const sent: TriggerRequest[] = [];
		s = await startTestServer({ game: { trigger: (r) => (sent.push(r), { status: 1 }) } });
		const r = await s.call("POST", "/api/v1/morse", { body: { text: "SOS", unitMs: 2000 } });
		expect(r.status).toBe(202);
		validateResponse("/api/v1/morse", "POST", 202, r.body);
		expect(r.body).toEqual({ text: "SOS", unitMs: 2000, repeat: 1 });
		const busy = await s.call("POST", "/api/v1/morse", { body: {} });
		expect(busy.status).toBe(409);
		validateResponse("/api/v1/morse", "POST", 409, busy.body);
		while (sent.length < 1) await new Promise((res) => setTimeout(res, 10));
		expect((await s.call("DELETE", "/api/v1/morse")).status).toBe(204);
		for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((res) => setTimeout(res, 20));
		expect(sent.map((x) => x.action_name)).toEqual(["toggle_flashlight", "toggle_flashlight"]);
		expect((await s.call("DELETE", "/api/v1/morse")).status).toBe(404);
		const empty = await s.call("POST", "/api/v1/morse", { body: { text: "???" } });
		expect(empty.status).toBe(422);
		validateResponse("/api/v1/morse", "POST", 422, empty.body);
	});
});
