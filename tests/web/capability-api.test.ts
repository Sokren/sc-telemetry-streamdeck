import { afterEach, describe, expect, test } from "vitest";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

let s: TestServer | undefined;
afterEach(async () => {
	await s?.close();
	s = undefined;
});

async function statusAfterCheck(server: TestServer) {
	for (let i = 0; i < 40; i++) {
		const r = await server.call("GET", "/api/v1/status");
		if (r.body.actions !== "unknown") return r;
		await new Promise((res) => setTimeout(res, 50));
	}
	return server.call("GET", "/api/v1/status");
}

describe("/api/v1/status : actions du jeu", () => {
	test("jeu 5.0 → actions available", async () => {
		s = await startTestServer({ game: {} });
		const r = await statusAfterCheck(s);
		validateResponse("/api/v1/status", "GET", 200, r.body);
		expect(r.body.actions).toBe("available");
	});

	test("jeu 4.10 (sans commandes d'actions) → unsupported", async () => {
		s = await startTestServer({ game: { legacy: true } });
		const r = await statusAfterCheck(s);
		validateResponse("/api/v1/status", "GET", 200, r.body);
		expect(r.body.actions).toBe("unsupported");
	});

	test("jeu fermé → unknown (rien n'est conclu)", async () => {
		s = await startTestServer({ game: null });
		await new Promise((res) => setTimeout(res, 300));
		const r = await s.call("GET", "/api/v1/status");
		validateResponse("/api/v1/status", "GET", 200, r.body);
		expect(r.body.actions).toBe("unknown");
	});
});
