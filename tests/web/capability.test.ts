import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ActionCapability } from "../../src/web/capability.js";

/** Faux jeu dont la réponse à la liste des actions est réglable. */
function game(answer: () => Promise<unknown>) {
	return { listActions: vi.fn(async () => (await answer()) as never) };
}
const grpcError = (code: number) => Object.assign(new Error("grpc"), { code });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ActionCapability", () => {
	test("inconnu au départ", () => {
		expect(new ActionCapability(game(async () => [])).value).toBe("unknown");
	});

	test("le jeu répond à la liste des actions → disponibles (5.0+)", async () => {
		const c = new ActionCapability(game(async () => []));
		expect(await c.refresh()).toBe("available");
	});

	test("le jeu ne connaît pas la commande (UNIMPLEMENTED, 4.10) → non supportées", async () => {
		const c = new ActionCapability(game(async () => Promise.reject(grpcError(12))));
		expect(await c.refresh()).toBe("unsupported");
	});

	test("jeu injoignable ou autre erreur → inconnu (on ne conclut rien)", async () => {
		const c = new ActionCapability(game(async () => Promise.reject(grpcError(14))));
		expect(await c.refresh()).toBe("unknown");
	});

	test("changement → prévenu une fois ; même valeur → pas de notification", async () => {
		let answer: () => Promise<unknown> = async () => Promise.reject(grpcError(12));
		const c = new ActionCapability(game(() => answer()));
		const seen: string[] = [];
		c.onChange((v) => seen.push(v));
		await c.refresh();
		await c.refresh();
		answer = async () => [];
		await c.refresh();
		expect(seen).toEqual(["unsupported", "available"]);
	});

	test("vérifié au démarrage puis toutes les 30 s ; arrêt → plus de vérification", async () => {
		const g = game(async () => []);
		const c = new ActionCapability(g, { intervalMs: 30_000 });
		c.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(g.listActions).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(g.listActions).toHaveBeenCalledTimes(2);
		c.stop();
		await vi.advanceTimersByTimeAsync(90_000);
		expect(g.listActions).toHaveBeenCalledTimes(2);
	});
});
