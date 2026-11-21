import type { IncomingMessage } from "node:http";
import qrcode from "qrcode-generator";
import type { Route } from "../http.js";
import { isLoopback, type LanChange, type LanManager } from "../lan.js";

const VIEW_ID = /^[A-Za-z0-9_-]{1,32}$/;
const pcOnly = { status: 403, json: { error: "pc_only" } } as const;

export type LanRoutesDeps = {
	lan: LanManager;
	/** L'appel vient-il du PC lui-même ? Seul le PC règle l'accès réseau et voit le lien. */
	isLocal: (req: IncomingMessage) => boolean;
	/** Adresses distantes des pages connectées (flux d'événements ouverts). */
	remotes: () => string[];
	/** Nouveau jeton : ferme les flux ouverts (les appareils devront rescanner le lien). */
	onToken: () => void;
};

function parseChange(x: unknown): LanChange | undefined {
	if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
	const o = x as Record<string, unknown>;
	const change: LanChange = {};
	for (const key of ["enabled", "all"] as const) {
		if (o[key] === undefined) continue;
		if (typeof o[key] !== "boolean") return undefined;
		change[key] = o[key];
	}
	if (o.network !== undefined) {
		if (typeof o.network !== "string" || !o.network || o.network.length > 256) return undefined;
		change.network = o.network;
	}
	return change;
}

/** Tablette / téléphone : accès depuis le réseau local, jeton, QR code. Réservé au PC. */
export function lanRoutes(deps: LanRoutesDeps): Route[] {
	const state = async () => {
		const remotes = deps.remotes();
		const others = new Set(remotes.filter((a) => !isLoopback(a))).size;
		return { ...(await deps.lan.state()), devices: { pc: remotes.some(isLoopback), others } };
	};
	return [
		{
			method: "GET",
			path: "/api/v1/lan",
			handle: async ({ req }) => (deps.isLocal(req) ? { status: 200, json: await state() } : pcOnly),
		},
		{
			method: "PUT",
			path: "/api/v1/lan",
			handle: async ({ req, body }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const change = parseChange(body);
				if (!change) return { status: 400, json: { error: "invalid_lan" } };
				const result = await deps.lan.set(change);
				return result === "ok" ? { status: 200, json: await state() } : { status: 500, json: { error: "listen_failed" } };
			},
		},
		{
			method: "POST",
			path: "/api/v1/lan/token",
			handle: async ({ req }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const token = deps.lan.rotateToken();
				// Après la réponse : la page du PC reçoit son nouveau jeton avant la fermeture des flux.
				setImmediate(deps.onToken);
				return { status: 200, json: { token } };
			},
		},
		{
			method: "GET",
			path: "/api/v1/lan/qr",
			handle: async ({ req, query }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const s = await deps.lan.state();
				if (!s.enabled) return { status: 409, json: { error: "lan_disabled" } };
				if (!s.url) return { status: 404, json: { error: "no_network" } };
				const view = query.get("view");
				const url = view && VIEW_ID.test(view) ? `${s.url}&view=${view}` : s.url;
				const qr = qrcode(0, "M");
				qr.addData(url);
				qr.make();
				return { status: 200, text: qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }), contentType: "image/svg+xml" };
			},
		},
	];
}
