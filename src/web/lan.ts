import dgram from "node:dgram";
import os from "node:os";
import { newToken, type WebSettings } from "./config.js";

/**
 * Accès depuis le réseau local (tablette, téléphone) : choix de la carte réseau, adresses d'écoute, lien.
 * Aucune IP n'est affichée par la page sans action explicite ; ce module ne fait que la calculer.
 */

/** Carte réseau utilisable par une tablette : `id` = `name` = nom Windows de la carte (jamais l'IP à l'écran). */
export type NetCard = { id: string; name: string; address: string };

/** Cartes virtuelles que la tablette ne peut pas joindre (machines virtuelles, WSL, conteneurs). */
const VIRTUAL = /vethernet|virtualbox|vmware|wsl|docker|hyper-v|loopback/i;

export function isPrivateV4(address: string): boolean {
	const [a, b] = address.split(".").map(Number);
	return a === 10 || (a === 192 && b === 168) || (a === 172 && b !== undefined && b >= 16 && b <= 31);
}

/** Adresse d'un appel venant du PC lui-même. */
export function isLoopback(address: string | undefined): boolean {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** Cartes candidates : IPv4 privées non internes, hors cartes virtuelles. */
export function lanCards(ifaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces()): NetCard[] {
	const cards: NetCard[] = [];
	for (const [name, infos] of Object.entries(ifaces)) {
		if (VIRTUAL.test(name)) continue;
		const info = infos?.find((i) => i.family === "IPv4" && !i.internal && isPrivateV4(i.address));
		if (info) cards.push({ id: name, name, address: info.address });
	}
	return cards;
}

/** Carte choisie : celle demandée, sinon celle de la route par défaut, sinon la première. */
export function pickCard(cards: NetCard[], preferred?: string, routeAddress?: string): NetCard | undefined {
	return cards.find((c) => c.id === preferred) ?? cards.find((c) => c.address === routeAddress) ?? cards[0];
}

/**
 * Adresse locale de la route par défaut : un socket UDP « connecté » ne fait que choisir la carte de sortie,
 * **aucun paquet n'est envoyé**. Pas de route (hors ligne) → `undefined`.
 */
export function defaultRouteAddress(): Promise<string | undefined> {
	return new Promise((resolve) => {
		const socket = dgram.createSocket("udp4");
		let finished = false;
		const done = (address?: string) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			try {
				socket.close();
			} catch {
				/* déjà fermé */
			}
			resolve(address && address !== "0.0.0.0" ? address : undefined);
		};
		const timer = setTimeout(() => done(), 1000);
		socket.on("error", () => done());
		socket.connect(53, "8.8.8.8", (err?: Error) => {
			if (err) return done();
			try {
				done(socket.address().address);
			} catch {
				done();
			}
		});
	});
}

export type LanState = {
	enabled: boolean;
	all: boolean;
	/** Lien complet (avec le jeton) pour la carte choisie ; absent si désactivé ou aucun réseau. */
	url?: string;
	/** Carte choisie. */
	network?: string;
	/** Cartes au choix, seulement s'il y en a plusieurs. */
	networks?: { id: string; name: string }[];
	error?: "listen_failed";
};

export type LanChange = { enabled?: boolean; all?: boolean; network?: string };

export type LanDeps = {
	settings: WebSettings;
	save: () => void;
	/**
	 * Écoute sur exactement ces adresses (même port). `false` : une adresse réseau n'a pas pu être ouverte ;
	 * erreur levée (avec son `code`) : le PC lui-même (127.0.0.1) n'a pas pu être ouvert.
	 */
	listen: (hosts: string[]) => Promise<boolean>;
	/** Port réellement ouvert (par défaut : celui des réglages). */
	port?: () => number;
	cards?: () => NetCard[];
	route?: () => Promise<string | undefined>;
	/** Vérification du réseau en arrière-plan quand l'accès est activé (défaut 15 s ; 0 : jamais). */
	recheckMs?: number;
};

const PC_ONLY = ["127.0.0.1"];

/** Réglages réseau et adresses d'écoute de l'appli. */
export class LanManager {
	#bound: string[] = [];
	#error: "listen_failed" | undefined;
	/** File d'attente : une seule mise à jour de l'écoute à la fois (onglets, lecture périodique, réglage). */
	#queue: Promise<unknown> = Promise.resolve();
	#timer: ReturnType<typeof setInterval> | undefined;
	readonly #cards: () => NetCard[];
	readonly #route: () => Promise<string | undefined>;

	constructor(private readonly deps: LanDeps) {
		this.#cards = deps.cards ?? (() => lanCards());
		this.#route = deps.route ?? defaultRouteAddress;
	}

	/** Première écoute, selon les réglages enregistrés, puis vérification du réseau en arrière-plan. */
	async start(): Promise<void> {
		await this.#sync();
		const every = this.deps.recheckMs ?? 15_000;
		if (every > 0) {
			// Wi-Fi arrivé après le démarrage, adresse changée (DHCP) : écoute relancée sans ouvrir la fenêtre.
			this.#timer = setInterval(() => {
				if (this.deps.settings.lan) this.#sync().catch(() => {});
			}, every);
			this.#timer.unref?.();
		}
	}

	stop(): void {
		clearInterval(this.#timer);
	}

	async state(): Promise<LanState> {
		const s = this.deps.settings;
		const { card, cards } = await this.#sync();
		const state: LanState = { enabled: s.lan, all: s.lanAll === true };
		if (s.lan && card) {
			state.url = `http://${card.address}:${this.deps.port?.() ?? s.port}/?t=${s.token}`;
			state.network = card.id;
			if (cards.length > 1) state.networks = cards.map(({ id, name }) => ({ id, name }));
		}
		if (this.#error) state.error = this.#error;
		return state;
	}

	async set(change: LanChange): Promise<"ok" | "listen_failed"> {
		const s = this.deps.settings;
		if (change.enabled !== undefined) s.lan = change.enabled;
		if (change.all !== undefined) s.lanAll = change.all;
		if (change.network !== undefined) s.lanNetwork = change.network;
		// Accès coupé : « toutes les interfaces » aussi (à reconfirmer à la prochaine activation).
		if (!s.lan) s.lanAll = false;
		this.deps.save();
		return (await this.#sync()).ok ? "ok" : "listen_failed";
	}

	/** Nouveau jeton (tous les appareils devront rescanner le lien). */
	rotateToken(): string {
		this.deps.settings.token = newToken();
		this.deps.save();
		return this.deps.settings.token;
	}

	/** Carte choisie et écoute à jour, une mise à jour à la fois. */
	#sync(): Promise<{ ok: boolean; card: NetCard | undefined; cards: NetCard[] }> {
		const run = async () => {
			const cards = this.#cards();
			const card = pickCard(cards, this.deps.settings.lanNetwork, cards.length > 1 ? await this.#route() : undefined);
			return { ok: await this.#apply(card), card, cards };
		};
		const next = this.#queue.then(run, run);
		this.#queue = next.catch(() => {});
		return next;
	}

	#hosts(card: NetCard | undefined): string[] {
		const s = this.deps.settings;
		if (!s.lan) return PC_ONLY;
		// Le PC aussi, en premier : détecte une autre instance et garde la page du PC lors des changements.
		if (s.lanAll) return [...PC_ONLY, "0.0.0.0"];
		return card ? [...PC_ONLY, card.address] : PC_ONLY;
	}

	/**
	 * Écoute sur les adresses voulues. Adresse réseau impossible à ouvrir → PC seul, puis (seulement si le PC a
	 * pu être ouvert) réseau désactivé et erreur gardée. PC lui-même impossible → erreur d'origine, réglages intacts.
	 */
	async #apply(card: NetCard | undefined): Promise<boolean> {
		const hosts = this.#hosts(card);
		if (hosts.join() === this.#bound.join()) return true;
		if (await this.deps.listen(hosts)) {
			this.#bound = hosts;
			if (this.deps.settings.lan) this.#error = undefined;
			return true;
		}
		if (!this.deps.settings.lan) throw new Error("listen_failed");
		await this.deps.listen(PC_ONLY);
		this.#bound = PC_ONLY;
		this.#error = "listen_failed";
		this.deps.settings.lan = false;
		this.deps.settings.lanAll = false;
		this.deps.save();
		return false;
	}
}
