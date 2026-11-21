import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EventHub } from "../../src/web/events.js";
import type { Tile } from "../../src/web/layout.js";
import { MorseControl } from "../../src/web/morse-control.js";
import { startTestServer, type TestServer } from "./harness.js";

/** Faux client SSE : enregistre les événements reçus. */
class FakeClient {
	req = new EventEmitter() as unknown as IncomingMessage;
	chunks: string[] = [];
	res = {
		writeHead: vi.fn(),
		write: (c: string) => (this.chunks.push(c), true),
		end: vi.fn(),
		on: (evt: string, cb: () => void) => (this.req as unknown as EventEmitter).on(evt, cb),
	} as unknown as ServerResponse;
	events(name?: string) {
		return this.chunks
			.join("")
			.split("\n\n")
			.filter((b) => b.startsWith("event:"))
			.map((b) => ({ event: b.match(/^event: (.+)$/m)![1], data: JSON.parse(b.match(/^data: (.+)$/m)![1]) }))
			.filter((e) => !name || e.event === name);
	}
	disconnect() {
		(this.req as unknown as EventEmitter).emit("close");
	}
}

class FakeHub {
	listeners = new Set<() => void>();
	actor: Record<string, unknown> | undefined;
	subscribe(l: () => void) {
		this.listeners.add(l);
		return () => void this.listeners.delete(l);
	}
	section(n: string) {
		return n === "actor" ? this.actor : undefined;
	}
	emit() {
		for (const l of [...this.listeners]) l();
	}
}

const LAYOUT: Tile[] = [
	{ type: "actor-display", settings: { value: "oxygen" } },
	{ type: "actor-display", settings: { value: "heart_rate" } },
	{ type: "actor-action", settings: { action: "emote_wave" } },
];

let hub: FakeHub;
let events: EventHub;
beforeEach(() => {
	vi.useFakeTimers();
	hub = new FakeHub();
	const game = { trigger: async () => ({ ok: true as const }) };
	events = new EventHub({
		hub,
		game,
		morse: new MorseControl(game),
		layout: () => LAYOUT,
		status: () => ({ telemetry: hub.actor ? "live" : "no_data" }),
	});
});
afterEach(() => {
	events.close();
	vi.useRealTimers();
});

describe("EventHub", () => {
	test("connexion → en-têtes SSE, état, toutes les tuiles, constantes et vaisseau", () => {
		const c = new FakeClient();
		events.connect(c.req, c.res, "fr");
		expect(c.res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ "content-type": expect.stringContaining("text/event-stream") }));
		expect(c.events("status")).toEqual([{ event: "status", data: { telemetry: "no_data" } }]);
		expect(c.events("tile").map((e) => e.data.index)).toEqual([0, 1, 2]);
		const state = c.events("state")[0].data;
		expect(state.vitals).toHaveLength(13);
		expect(state.ship).toHaveLength(17);
		expect(state.character).toMatchObject({ available: false, locomotion: "unknown" });
		expect(state.shipStatus).toMatchObject({ available: false, instruments: expect.any(Array), annunciators: expect.any(Array) });
	});

	test("changement du flux → seulement les tuiles qui changent, + état", () => {
		const c = new FakeClient();
		events.connect(c.req, c.res, "fr");
		c.chunks = [];
		hub.actor = { vitals: { heart_rate: 70 } };
		hub.emit();
		vi.advanceTimersByTime(300);
		expect(c.events("tile").map((e) => e.data.index)).toEqual([1]); // cœur seulement : l'oxygène reste « — », l'émote ne change pas
		expect(c.events("status")).toEqual([{ event: "status", data: { telemetry: "live" } }]);
		expect(c.events("state")).toHaveLength(1);
		c.chunks = [];
		hub.emit();
		vi.advanceTimersByTime(300);
		expect(c.events()).toEqual([]); // rien n'a changé
	});

	test("au plus un envoi toutes les 250 ms", () => {
		const c = new FakeClient();
		events.connect(c.req, c.res, "fr");
		vi.advanceTimersByTime(300);
		c.chunks = [];
		for (let i = 60; i < 70; i++) {
			hub.actor = { vitals: { heart_rate: i } };
			hub.emit();
			vi.advanceTimersByTime(20);
		}
		vi.advanceTimersByTime(300);
		expect(c.events("tile").length).toBeLessThanOrEqual(2);
		expect(c.events("tile").at(-1)?.data.index).toBe(1);
	});

	test("retour d'appui diffusé à tous les clients", () => {
		const a = new FakeClient();
		const b = new FakeClient();
		events.connect(a.req, a.res, "fr");
		events.connect(b.req, b.res, "en");
		events.feedback(2, { feedback: "ok" });
		expect(a.events("feedback")).toEqual([{ event: "feedback", data: { index: 2, feedback: "ok" } }]);
		expect(b.events("feedback")).toHaveLength(1);
	});

	test("déconnexion → plus d'écriture ; hub désabonné quand plus aucun client", () => {
		const a = new FakeClient();
		const b = new FakeClient();
		events.connect(a.req, a.res, "fr");
		events.connect(b.req, b.res, "fr");
		expect(hub.listeners.size).toBe(1);
		a.disconnect();
		expect(hub.listeners.size).toBe(1);
		a.chunks = [];
		hub.actor = { vitals: { heart_rate: 99 } };
		hub.emit();
		vi.advanceTimersByTime(300);
		expect(a.chunks).toEqual([]);
		b.disconnect();
		expect(hub.listeners.size).toBe(0);
	});

	test("ping toutes les 15 s", () => {
		const c = new FakeClient();
		events.connect(c.req, c.res, "fr");
		c.chunks = [];
		vi.advanceTimersByTime(15_000);
		expect(c.chunks.join("")).toContain(": ping");
	});
});

describe("GET /api/v1/events (serveur réel)", () => {
	let s: TestServer | undefined;
	afterEach(async () => {
		await s?.close();
		s = undefined;
	});

	test("flux SSE avec jeton ; 401 sans jeton", async () => {
		vi.useRealTimers();
		s = await startTestServer({ game: null });
		expect((await s.call("GET", "/api/v1/events", { auth: false })).status).toBe(401);
		const ctrl = new AbortController();
		const res = await fetch(`${s.url}/api/v1/events?t=${s.token}&lang=fr`, { signal: ctrl.signal });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const reader = res.body!.getReader();
		let text = "";
		while (!text.includes("event: state")) text += new TextDecoder().decode((await reader.read()).value);
		expect(text).toContain("event: status");
		expect(text.match(/event: tile/g)).toHaveLength(10);
		ctrl.abort();
	});
});
