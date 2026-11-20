import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ActionSource, readSnapshot } from "../../src/catalog/source.js";
import type { GameAction, GameApi, TriggerResult } from "../../src/game/types.js";

const live: GameAction[] = [{ name: "emote_wave", category: "player_emotes", holdable: false }];
const snap: GameAction[] = [{ name: "emote_dance", category: "player_emotes", holdable: false }];

class FakeGame implements GameApi {
	calls = 0;
	timeouts: number[] = [];
	constructor(public up: boolean) {}
	async listActions(timeoutMs: number): Promise<GameAction[]> {
		this.calls++;
		this.timeouts.push(timeoutMs);
		if (!this.up) throw new Error("UNAVAILABLE");
		return live;
	}
	async trigger(): Promise<TriggerResult> {
		return { ok: true };
	}
	close(): void {}
}

describe("ActionSource", () => {
	test("jeu joignable → actions du jeu, live, délai 1500 ms", async () => {
		const game = new FakeGame(true);
		expect(await new ActionSource(game, () => snap).getActions()).toEqual({ actions: live, live: true });
		expect(game.timeouts).toEqual([1500]);
	});

	test("jeu injoignable → instantané, pas live", async () => {
		expect(await new ActionSource(new FakeGame(false), () => snap).getActions()).toEqual({ actions: snap, live: false });
	});

	test("après un succès, la liste vient du cache", async () => {
		const game = new FakeGame(true);
		const source = new ActionSource(game, () => snap);
		await source.getActions();
		await source.getActions();
		expect(game.calls).toBe(1);
	});

	test("après un échec, le jeu est réinterrogé au prochain appel", async () => {
		const game = new FakeGame(false);
		const source = new ActionSource(game, () => snap);
		await source.getActions();
		game.up = true;
		expect(await source.getActions()).toEqual({ actions: live, live: true });
	});

	test("invalidate() → le jeu est réinterrogé", async () => {
		const game = new FakeGame(true);
		const source = new ActionSource(game, () => snap);
		await source.getActions();
		source.invalidate();
		await source.getActions();
		expect(game.calls).toBe(2);
	});
});

describe("ActionSource — liste du jeu vide ou périmée", () => {
	test("liste vide (perso pas spawné) → instantané, et le jeu est réinterrogé ensuite", async () => {
		const game = new FakeGame(true);
		let answer: GameAction[] = [];
		game.listActions = async () => (game.calls++, answer);
		const source = new ActionSource(game, () => snap);
		expect(await source.getActions()).toEqual({ actions: snap, live: false });
		answer = live;
		expect(await source.getActions()).toEqual({ actions: live, live: true });
		expect(game.calls).toBe(2);
	});

	test("le cache expire après 60 s", async () => {
		const game = new FakeGame(true);
		let now = 0;
		const source = new ActionSource(game, () => snap, () => now);
		await source.getActions();
		now = 59_000;
		await source.getActions();
		expect(game.calls).toBe(1);
		now = 61_000;
		await source.getActions();
		expect(game.calls).toBe(2);
	});
});

describe("readSnapshot", () => {
	test("lit schema/actions.json", () => {
		const actions = readSnapshot(fileURLToPath(new URL("../../schema/actions.json", import.meta.url)));
		expect(actions.length).toBe(112);
		expect(actions).toContainEqual({ name: "emote_wave", category: "player_emotes", holdable: false });
		expect(actions).toContainEqual({ name: "v_invoke_ping", category: "spaceship_radar", holdable: true });
	});

	test("fichier absent → [] sans exception", () => {
		expect(readSnapshot("introuvable.json")).toEqual([]);
	});

	test("fichier illisible → [] sans exception", () => {
		expect(readSnapshot(fileURLToPath(new URL("../../schema/sc_extrait.desc", import.meta.url)))).toEqual([]);
	});
});
