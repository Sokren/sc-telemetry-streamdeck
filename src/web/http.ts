import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toLang, type Lang } from "../catalog/labels.js";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export type Ctx = {
	params: Record<string, string>;
	query: URLSearchParams;
	body: unknown;
	lang: Lang;
	req: IncomingMessage;
	res: ServerResponse;
};

/** Réponse d'une route ; `stream` : la route écrit elle-même la réponse (Server-Sent Events). */
export type Reply = { status: number; json?: unknown; text?: string; data?: Buffer; contentType?: string } | { stream: true };

export type Route = {
	method: Method;
	/** Chemin au format OpenAPI, ex. `/api/v1/actions/{name}/trigger`. */
	path: string;
	/** Accessible sans jeton (documentation, page). */
	public?: boolean;
	handle(ctx: Ctx): Promise<Reply>;
};

const MAX_BODY = 64 * 1024;

type Compiled = Route & { regex: RegExp; names: string[] };

function compile(route: Route): Compiled {
	const names: string[] = [];
	const pattern = route.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{([^}]+)\\?\}|\{([^}]+)\}/g, (_m, a, b) => {
		names.push(a ?? b);
		return "([^/]+)";
	});
	return { ...route, regex: new RegExp(`^${pattern}$`), names };
}

/** Jeton de la requête : en-tête `Authorization: Bearer …`, sinon paramètre `t`. */
function tokenOf(req: IncomingMessage, query: URLSearchParams): string | undefined {
	const header = req.headers.authorization;
	if (header?.startsWith("Bearer ")) return header.slice(7).trim();
	return query.get("t") ?? undefined;
}

function sameToken(given: string | undefined, expected: string): boolean {
	if (!given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Langue : `?lang=fr|en`, sinon `Accept-Language`, sinon anglais. */
export function langOf(req: IncomingMessage, query: URLSearchParams): Lang {
	const asked = query.get("lang");
	if (asked === "fr" || asked === "en") return asked;
	return toLang(req.headers["accept-language"]?.split(",")[0]?.trim() ?? "en");
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				reject(new Error("too_large"));
				req.destroy();
			} else chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

export function send(res: ServerResponse, reply: Exclude<Reply, { stream: true }>): void {
	const headers: Record<string, string> = { "cache-control": "no-store" };
	let payload: string | Buffer = "";
	if (reply.json !== undefined) {
		headers["content-type"] = "application/json; charset=utf-8";
		payload = JSON.stringify(reply.json);
	} else if (reply.data) {
		headers["content-type"] = reply.contentType ?? "application/octet-stream";
		payload = reply.data;
	} else if (reply.text !== undefined) {
		headers["content-type"] = reply.contentType ?? "text/plain; charset=utf-8";
		payload = reply.text;
	}
	res.writeHead(reply.status, headers);
	res.end(payload);
}

/** Gestionnaire HTTP : routage, jeton, corps JSON, langue. */
export function createHandler(
	routes: Route[],
	token: () => string,
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean,
): (req: IncomingMessage, res: ServerResponse) => void {
	const compiled = routes.map(compile);
	return (req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const method = (req.method ?? "GET").toUpperCase();
			let match: { route: Compiled; params: Record<string, string> } | undefined;
			for (const route of compiled) {
				if (route.method !== method) continue;
				const m = route.regex.exec(url.pathname);
				if (m) {
					match = { route, params: Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
					break;
				}
			}
			if (!match) {
				if (!fallback?.(req, res)) send(res, { status: 404, json: { error: "not_found" } });
				return;
			}
			if (!match.route.public && !sameToken(tokenOf(req, url.searchParams), token())) {
				send(res, { status: 401, json: { error: "unauthorized" } });
				return;
			}
			let body: unknown;
			if (method === "POST" || method === "PUT") {
				try {
					const text = await readBody(req);
					body = text.trim() ? JSON.parse(text) : undefined;
				} catch {
					send(res, { status: 400, json: { error: "bad_request" } });
					return;
				}
			}
			const reply = await match.route.handle({
				params: match.params,
				query: url.searchParams,
				body,
				lang: langOf(req, url.searchParams),
				req,
				res,
			});
			if (!("stream" in reply)) send(res, reply);
		})().catch(() => {
			if (!res.headersSent) send(res, { status: 500, json: { error: "internal" } });
			else res.end();
		});
	};
}
