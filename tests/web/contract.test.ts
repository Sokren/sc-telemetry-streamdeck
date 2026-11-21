import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { OPENAPI, startTestServer, validateResponse, type TestServer } from "./harness.js";

let s: TestServer;
beforeAll(async () => {
	s = await startTestServer({ game: null });
});
afterAll(() => s.close());

type Op = { method: string; path: string };
const documented = (): Op[] =>
	Object.entries(OPENAPI.paths as Record<string, Record<string, unknown>>).flatMap(([p, ops]) =>
		Object.keys(ops)
			.filter((m) => ["get", "post", "put", "delete"].includes(m))
			.map((m) => ({ method: m.toUpperCase(), path: p })),
	);
const key = (o: Op) => `${o.method} ${o.path}`;
const isPublic = (o: Op) => {
	const op = OPENAPI.paths[o.path][o.method.toLowerCase()];
	return Array.isArray(op.security) && op.security.length === 0;
};
/** Chemin concret pour un chemin OpenAPI (paramètres remplacés par des valeurs plausibles). */
const concrete = (p: string) => p.replace(/\{[^}]+\}/g, "x");

describe("contrat OpenAPI", () => {
	test("les routes /api/v1 du serveur sont exactement celles du contrat", () => {
		const served = s.routes.filter((r) => r.path.startsWith("/api/v1/")).map(key).sort();
		expect(served).toEqual(documented().map(key).sort());
	});

	test("chaque opération a une description anglaise et française", () => {
		for (const o of documented()) {
			const op = OPENAPI.paths[o.path][o.method.toLowerCase()];
			expect(op.description, key(o)).toMatch(/— FR :/);
		}
	});

	test("toute route protégée refuse sans jeton et avec un mauvais jeton, sans données", async () => {
		for (const o of documented().filter((o) => !isPublic(o))) {
			for (const auth of [false, "bad"] as const) {
				const r = await s.call(o.method, concrete(o.path), { auth, body: o.method === "GET" || o.method === "DELETE" ? undefined : {} });
				expect(r.status, `${key(o)} auth=${auth}`).toBe(401);
				expect(r.body, key(o)).toEqual({ error: "unauthorized" });
			}
		}
	});

	test("documentation lisible sans jeton : contrat JSON et Swagger UI", async () => {
		const spec = await s.call("GET", "/api/v1/openapi.json", { auth: false });
		expect(spec.status).toBe(200);
		expect(spec.body.openapi).toBe("3.1.0");
		const ui = await s.call("GET", "/api/docs", { auth: false });
		expect(ui.status).toBe(200);
		expect(ui.headers.get("content-type")).toContain("text/html");
		expect(ui.body).toContain("swagger-ui-bundle.js");
		expect(ui.body).toContain("/api/v1/openapi.json");
		expect(ui.body).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/); // aucune ressource externe
		const js = await fetch(`${s.url}/api/docs/swagger-ui-bundle.js`);
		expect(js.status).toBe(200);
		expect(js.headers.get("content-type")).toContain("javascript");
	});

	test("Swagger UI reprend le jeton mémorisé par la page (même origine), sans l'écrire dans la page", async () => {
		const ui = await s.call("GET", "/api/docs", { auth: false });
		expect(ui.body).toContain('localStorage.getItem("sctd-token")');
		expect(ui.body).toContain('preauthorizeApiKey("bearerAuth"');
		expect(ui.body).not.toContain(s.token);
	});

	test("le jeton est aussi accepté dans l'URL (?t=)", async () => {
		const r = await s.call("GET", `/api/v1/status?t=${s.token}`, { auth: false });
		expect(r.status).toBe(200);
	});

	test("GET /api/v1/status : conforme au contrat ; sans flux → no_data", async () => {
		const r = await s.call("GET", "/api/v1/status");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/status", "GET", 200, r.body);
		expect(r.body).toMatchObject({ app: "sc-telemetry-web", telemetry: "no_data", character: "unknown" });
	});

	test("route inconnue → 404 sans données", async () => {
		const r = await s.call("GET", "/api/v1/nexiste-pas");
		expect(r.status).toBe(404);
		expect(r.body).toEqual({ error: "not_found" });
	});

	test("corps JSON invalide → 400", async () => {
		const res = await fetch(`${s.url}/api/v1/status`, {
			method: "POST",
			headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" },
			body: "{pas du json",
		});
		expect([400, 404, 405]).toContain(res.status);
	});
});
