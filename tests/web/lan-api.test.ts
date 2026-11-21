import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { LanManager } from "../../src/web/lan.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});

/** Appli de test avec un faux réseau : deux cartes, route par défaut sur le Wi-Fi, écoute simulée. */
async function start(opts: { local?: boolean; failListen?: boolean } = {}) {
	const listened: string[][] = [];
	let s!: TestServer;
	s = await startTestServer({
		game: null,
		extra: {
			isLocal: (_req: IncomingMessage) => opts.local !== false,
			lanFactory: (settings, save) =>
				new LanManager({
					settings,
					save,
					listen: async (hosts) => (listened.push(hosts), !(opts.failListen && hosts.length > 1)),
					cards: () => [
						{ id: "Ethernet", name: "Ethernet", address: "192.168.1.20" },
						{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.5" },
					],
					route: async () => "10.0.0.5",
				}),
		},
	});
	servers.push(s);
	return { s, listened };
}

describe("/api/v1/lan", () => {
	test("GET : désactivé par défaut, conforme au contrat", async () => {
		const { s } = await start();
		const r = await s.call("GET", "/api/v1/lan");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/lan", "GET", 200, r.body);
		expect(r.body).toEqual({ enabled: false, all: false, devices: { pc: false, others: 0 } });
	});

	test("PUT : activation, lien avec le jeton, choix du réseau, toutes les interfaces", async () => {
		const { s, listened } = await start();
		const on = await s.call("PUT", "/api/v1/lan", { body: { enabled: true } });
		expect(on.status).toBe(200);
		validateResponse("/api/v1/lan", "PUT", 200, on.body);
		expect(on.body).toMatchObject({ enabled: true, all: false, url: `http://10.0.0.5:8743/?t=${s.token}`, network: "Wi-Fi" });
		expect(on.body.networks).toEqual([
			{ id: "Ethernet", name: "Ethernet" },
			{ id: "Wi-Fi", name: "Wi-Fi" },
		]);
		expect(listened.at(-1)).toEqual(["127.0.0.1", "10.0.0.5"]);
		expect((await s.call("PUT", "/api/v1/lan", { body: { network: "Ethernet" } })).body.url).toContain("192.168.1.20");
		await s.call("PUT", "/api/v1/lan", { body: { all: true } });
		expect(listened.at(-1)).toEqual(["127.0.0.1", "0.0.0.0"]);
		expect(s.deps.settings).toMatchObject({ lan: true, lanAll: true, lanNetwork: "Ethernet" });
	});

	test("PUT invalide : 400", async () => {
		const { s } = await start();
		for (const body of [{ enabled: "oui" }, { all: 1 }, { network: "" }, { network: "x".repeat(300) }, [], "x"]) {
			const r = await s.call("PUT", "/api/v1/lan", { body });
			expect(r.status).toBe(400);
			validateResponse("/api/v1/lan", "PUT", 400, r.body);
			expect(r.body).toEqual({ error: "invalid_lan" });
		}
	});

	test("port pris : 500 listen_failed, réglage remis à désactivé", async () => {
		const { s } = await start({ failListen: true });
		const r = await s.call("PUT", "/api/v1/lan", { body: { enabled: true } });
		expect(r.status).toBe(500);
		validateResponse("/api/v1/lan", "PUT", 500, r.body);
		expect(r.body).toEqual({ error: "listen_failed" });
		expect((await s.call("GET", "/api/v1/lan")).body).toMatchObject({ enabled: false, error: "listen_failed" });
	});

	test("réservé au PC : une tablette reçoit 403 pc_only sur toutes les routes réseau", async () => {
		const { s } = await start({ local: false });
		for (const [method, p] of [
			["GET", "/api/v1/lan"],
			["PUT", "/api/v1/lan"],
			["POST", "/api/v1/lan/token"],
			["GET", "/api/v1/lan/qr"],
		] as const) {
			const r = await s.call(method, p, method === "PUT" ? { body: { enabled: true } } : {});
			expect(r.status, `${method} ${p}`).toBe(403);
			expect(r.body).toEqual({ error: "pc_only" });
		}
		validateResponse("/api/v1/lan", "GET", 403, { error: "pc_only" });
		expect(s.deps.settings.lan).toBe(false);
	});

	test("appareils connectés : le PC compte, aucune adresse renvoyée", async () => {
		const { s } = await start();
		const ctrl = new AbortController();
		const res = await fetch(`${s.url}/api/v1/events?t=${s.token}`, { signal: ctrl.signal });
		await res.body!.getReader().read();
		const r = await s.call("GET", "/api/v1/lan");
		ctrl.abort();
		expect(r.body.devices).toEqual({ pc: true, others: 0 });
		expect(JSON.stringify(r.body)).not.toContain("127.0.0.1");
	});

	test("nouveau jeton : enregistré, ancien refusé, flux fermés", async () => {
		const { s } = await start();
		const old = s.token;
		const ctrl = new AbortController();
		const res = await fetch(`${s.url}/api/v1/events?t=${old}`, { signal: ctrl.signal });
		const reader = res.body!.getReader();
		await reader.read();
		const r = await s.call("POST", "/api/v1/lan/token");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/lan/token", "POST", 200, r.body);
		expect(r.body.token).not.toBe(old);
		expect(s.deps.settings.token).toBe(r.body.token);
		let ended = false;
		for (let i = 0; i < 20 && !ended; i++) ended = (await reader.read()).done;
		expect(ended).toBe(true);
		const refused = await fetch(`${s.url}/api/v1/status`, { headers: { authorization: `Bearer ${old}` } });
		expect(refused.status).toBe(401);
		const ok = await fetch(`${s.url}/api/v1/status`, { headers: { authorization: `Bearer ${r.body.token}` } });
		expect(ok.status).toBe(200);
	});

	test("QR code : SVG du lien (avec la vue), 409 si désactivé", async () => {
		const { s } = await start();
		const off = await s.call("GET", "/api/v1/lan/qr");
		expect(off.status).toBe(409);
		validateResponse("/api/v1/lan/qr", "GET", 409, off.body);
		expect(off.body).toEqual({ error: "lan_disabled" });
		await s.call("PUT", "/api/v1/lan", { body: { enabled: true } });
		const res = await fetch(`${s.url}/api/v1/lan/qr?view=vabc123`, { headers: { authorization: `Bearer ${s.token}` } });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("image/svg+xml");
		expect(res.headers.get("cache-control")).toBe("no-store");
		const svg = await res.text();
		expect(svg.startsWith("<svg")).toBe(true);
		const plain = await (await fetch(`${s.url}/api/v1/lan/qr`, { headers: { authorization: `Bearer ${s.token}` } })).text();
		const bad = await (await fetch(`${s.url}/api/v1/lan/qr?view=${encodeURIComponent("a b")}`, { headers: { authorization: `Bearer ${s.token}` } })).text();
		expect(svg).not.toBe(plain);
		expect(bad).toBe(plain);
	});

	test("QR code sans réseau local : 404 no_network", async () => {
		const s = await startTestServer({
			game: null,
			extra: {
				isLocal: () => true,
				lanFactory: (settings, save) => new LanManager({ settings, save, listen: async () => true, cards: () => [], route: async () => undefined }),
			},
		});
		servers.push(s);
		await s.call("PUT", "/api/v1/lan", { body: { enabled: true } });
		const r = await s.call("GET", "/api/v1/lan/qr");
		expect(r.status).toBe(404);
		validateResponse("/api/v1/lan/qr", "GET", 404, r.body);
		expect(r.body).toEqual({ error: "no_network" });
	});
});
