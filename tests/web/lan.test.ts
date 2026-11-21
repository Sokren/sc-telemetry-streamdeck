import type os from "node:os";
import { describe, expect, test, vi } from "vitest";
import type { WebSettings } from "../../src/web/config.js";
import { isLoopback, LanManager, lanCards, pickCard, type NetCard } from "../../src/web/lan.js";

type Ifaces = ReturnType<typeof os.networkInterfaces>;
const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: `${address}/24` }) as os.NetworkInterfaceInfo;
const v6 = (address: string) => ({ address, family: "IPv6", internal: false, netmask: "ffff::", mac: "00:00:00:00:00:00", cidr: `${address}/64`, scopeid: 0 }) as os.NetworkInterfaceInfo;

const IFACES: Ifaces = {
	"Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
	"vEthernet (WSL)": [v4("172.24.0.1")],
	"VirtualBox Host-Only Network": [v4("192.168.56.1")],
	Ethernet: [v6("fe80::1"), v4("192.168.1.20")],
	"Wi-Fi": [v4("10.0.0.5")],
	Tailscale: [v4("100.101.102.103")],
	Public: [v4("8.8.4.4")],
};

describe("cartes réseau", () => {
	test("garde les IPv4 privées, écarte les cartes virtuelles, IPv6, internes et publiques", () => {
		expect(lanCards(IFACES)).toEqual([
			{ id: "Ethernet", name: "Ethernet", address: "192.168.1.20" },
			{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.5" },
		]);
		expect(lanCards({ "VMware Network Adapter VMnet8": [v4("192.168.200.1")], "Docker NAT": [v4("10.1.0.1")], "Hyper-V x": [v4("172.16.0.2")] })).toEqual([]);
		expect(lanCards({ a: [v4("172.15.0.1"), v4("172.32.0.1")], b: [v4("172.31.255.1")] })).toEqual([{ id: "b", name: "b", address: "172.31.255.1" }]);
	});

	test("choix : carte demandée, sinon celle de la route par défaut, sinon la première", () => {
		const cards = lanCards(IFACES);
		expect(pickCard(cards, "Wi-Fi", "192.168.1.20")?.id).toBe("Wi-Fi");
		expect(pickCard(cards, "disparue", "10.0.0.5")?.id).toBe("Wi-Fi");
		expect(pickCard(cards, undefined, "172.24.0.1")?.id).toBe("Ethernet");
		expect(pickCard(cards, undefined, undefined)?.id).toBe("Ethernet");
		expect(pickCard([], "Wi-Fi", "10.0.0.5")).toBeUndefined();
	});

	test("adresses locales", () => {
		for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(a)).toBe(true);
		for (const a of ["192.168.1.20", "::ffff:192.168.1.20", undefined, ""]) expect(isLoopback(a)).toBe(false);
	});
});

function manager(opts: { cards?: NetCard[]; route?: string; fail?: (hosts: string[]) => boolean } = {}) {
	const settings: WebSettings = { port: 8743, lan: false, token: "x".repeat(32) };
	const listened: string[][] = [];
	let saves = 0;
	const m = new LanManager({
		settings,
		save: () => saves++,
		listen: async (hosts) => {
			listened.push(hosts);
			return !opts.fail?.(hosts);
		},
		cards: () => opts.cards ?? lanCards(IFACES),
		route: async () => opts.route,
	});
	return { m, settings, listened, saves: () => saves };
}

describe("LanManager", () => {
	test("désactivé : PC seul, pas d'adresse", async () => {
		const { m, listened } = manager();
		await m.start();
		expect(listened).toEqual([["127.0.0.1"]]);
		expect(await m.state()).toEqual({ enabled: false, all: false });
	});

	test("activé : PC + carte de la route par défaut ; lien sans IP ailleurs que dans url ; choix de carte enregistré", async () => {
		const { m, settings, listened, saves } = manager({ route: "10.0.0.5" });
		await m.start();
		expect(await m.set({ enabled: true })).toBe("ok");
		expect(settings.lan).toBe(true);
		expect(listened.at(-1)).toEqual(["127.0.0.1", "10.0.0.5"]);
		const s = await m.state();
		expect(s).toEqual({
			enabled: true,
			all: false,
			url: `http://10.0.0.5:8743/?t=${settings.token}`,
			network: "Wi-Fi",
			networks: [
				{ id: "Ethernet", name: "Ethernet" },
				{ id: "Wi-Fi", name: "Wi-Fi" },
			],
		});
		expect(await m.set({ network: "Ethernet" })).toBe("ok");
		expect(settings.lanNetwork).toBe("Ethernet");
		expect(listened.at(-1)).toEqual(["127.0.0.1", "192.168.1.20"]);
		expect(saves()).toBe(2);
	});

	test("une seule carte : pas de liste de réseaux", async () => {
		const { m } = manager({ cards: [{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.5" }] });
		await m.set({ enabled: true });
		const s = await m.state();
		expect(s.networks).toBeUndefined();
		expect(s.network).toBe("Wi-Fi");
	});

	test("toutes les interfaces (0.0.0.0) : option avancée", async () => {
		const { m, settings, listened } = manager();
		await m.set({ enabled: true, all: true });
		expect(settings.lanAll).toBe(true);
		expect(listened.at(-1)).toEqual(["127.0.0.1", "0.0.0.0"]);
		expect((await m.state()).all).toBe(true);
		await m.set({ all: false });
		expect(listened.at(-1)).toEqual(["127.0.0.1", "192.168.1.20"]);
	});

	test("aucun réseau local : activé mais sans adresse, PC seul", async () => {
		const { m, listened } = manager({ cards: [] });
		await m.set({ enabled: true });
		expect(listened.at(-1)).toEqual(["127.0.0.1"]);
		expect(await m.state()).toEqual({ enabled: true, all: false });
	});

	test("échec d'écoute : retour au PC seul, réglage désactivé, erreur gardée jusqu'à la prochaine réussite", async () => {
		const { m, settings, listened } = manager({ fail: (h) => h.length > 1 });
		expect(await m.set({ enabled: true })).toBe("listen_failed");
		expect(settings.lan).toBe(false);
		expect(listened.at(-1)).toEqual(["127.0.0.1"]);
		expect(await m.state()).toEqual({ enabled: false, all: false, error: "listen_failed" });
	});

	test("démarrage avec le réseau activé mais port pris : PC seul et erreur", async () => {
		const { m, settings } = manager({ fail: (h) => h.length > 1 });
		settings.lan = true;
		await m.start();
		expect(settings.lan).toBe(false);
		expect((await m.state()).error).toBe("listen_failed");
	});

	test("adresse de la carte changée (DHCP) : écoute relancée à la lecture", async () => {
		let cards = [{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.5" }];
		const settings: WebSettings = { port: 8743, lan: true, token: "x".repeat(32) };
		const listened: string[][] = [];
		const m = new LanManager({ settings, save: () => {}, listen: async (h) => (listened.push(h), true), cards: () => cards, route: async () => undefined });
		await m.start();
		cards = [{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.9" }];
		expect((await m.state()).url).toContain("10.0.0.9");
		expect(listened.at(-1)).toEqual(["127.0.0.1", "10.0.0.9"]);
	});

	test("PC lui-même injoignable (autre instance) : erreur d'origine, réglages non touchés", async () => {
		const settings: WebSettings = { port: 8743, lan: true, lanAll: true, token: "x".repeat(32) };
		let saves = 0;
		const busy = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
		const m = new LanManager({
			settings,
			save: () => saves++,
			listen: async (hosts) => {
				if (hosts.includes("127.0.0.1")) throw busy;
				return false;
			},
			cards: () => [],
			route: async () => undefined,
		});
		await expect(m.start()).rejects.toBe(busy);
		expect(settings.lan).toBe(true);
		expect(saves).toBe(0);
	});

	test("lectures et réglages simultanés : jamais deux écoutes en même temps", async () => {
		let running = 0;
		let overlap = false;
		const settings: WebSettings = { port: 8743, lan: false, token: "x".repeat(32) };
		const m = new LanManager({
			settings,
			save: () => {},
			listen: async () => {
				running++;
				if (running > 1) overlap = true;
				await new Promise((r) => setTimeout(r, 20));
				running--;
				return true;
			},
			cards: () => lanCards(IFACES),
			route: () => new Promise((r) => setTimeout(() => r("10.0.0.5"), 10)),
		});
		await m.start();
		await Promise.all([m.state(), m.set({ enabled: true }), m.state(), m.set({ network: "Ethernet" }), m.state()]);
		expect(overlap).toBe(false);
		expect(settings.lan).toBe(true);
	});

	test("couper l'accès réseau désactive aussi « toutes les interfaces » (reconfirmation à la réactivation)", async () => {
		const { m, settings, listened } = manager();
		await m.set({ enabled: true, all: true });
		await m.set({ enabled: false });
		expect(settings.lanAll).toBe(false);
		await m.set({ enabled: true });
		expect(listened.at(-1)).toEqual(["127.0.0.1", "192.168.1.20"]);
	});

	test("lien avec le port réellement ouvert", async () => {
		const settings: WebSettings = { port: 8743, lan: true, token: "x".repeat(32) };
		const m = new LanManager({ settings, save: () => {}, listen: async () => true, port: () => 9001, cards: () => [{ id: "a", name: "a", address: "10.0.0.5" }], route: async () => undefined });
		expect((await m.state()).url).toBe(`http://10.0.0.5:9001/?t=${settings.token}`);
	});

	test("vérification en arrière-plan : réseau arrivé après le démarrage, écoute relancée sans ouvrir la fenêtre", async () => {
		vi.useFakeTimers();
		try {
			let cards: NetCard[] = [];
			const settings: WebSettings = { port: 8743, lan: true, token: "x".repeat(32) };
			const listened: string[][] = [];
			const m = new LanManager({ settings, save: () => {}, listen: async (h) => (listened.push(h), true), cards: () => cards, route: async () => undefined, recheckMs: 15_000 });
			await m.start();
			expect(listened.at(-1)).toEqual(["127.0.0.1"]);
			cards = [{ id: "Wi-Fi", name: "Wi-Fi", address: "10.0.0.5" }];
			await vi.advanceTimersByTimeAsync(15_000);
			expect(listened.at(-1)).toEqual(["127.0.0.1", "10.0.0.5"]);
			m.stop();
		} finally {
			vi.useRealTimers();
		}
	});

	test("nouveau jeton : différent, assez long, enregistré", () => {
		const { m, settings, saves } = manager();
		const old = settings.token;
		const token = m.rotateToken();
		expect(token).not.toBe(old);
		expect(token.length).toBeGreaterThanOrEqual(32);
		expect(settings.token).toBe(token);
		expect(saves()).toBe(1);
	});
});
