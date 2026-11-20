import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { GameClient } from "../../src/game/client.js";
import { loadSchema } from "../../src/game/schema.js";
import { DESC_PATH, startFakeGame, type FakeHandlers, type TriggerRequest } from "./fake-server.js";

const schema = loadSchema(fileURLToPath(DESC_PATH));
const CLOSED = "127.0.0.1:1"; // aucun serveur n'écoute ici

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	await Promise.all(cleanup.map((f) => f()));
	cleanup = [];
});

async function clientFor(h: FakeHandlers): Promise<GameClient> {
	const game = await startFakeGame(h);
	const client = new GameClient(schema, `127.0.0.1:${game.port}`);
	cleanup.push(async () => {
		client.close();
		await game.stop();
	});
	return client;
}

describe("GameClient", () => {
	test("listActions renvoie les actions du jeu", async () => {
		const client = await clientFor({ actions: [{ action_name: "emote_wave", category: "player_emotes", holdable: false }] });
		expect(await client.listActions(1500)).toEqual([{ name: "emote_wave", category: "player_emotes", holdable: false }]);
	});

	test("listActions : holdable absent (proto3) vaut false, présent vaut true", async () => {
		const client = await clientFor({
			actions: [
				{ action_name: "emote_wave", category: "player_emotes" },
				{ action_name: "v_invoke_ping", category: "spaceship_radar", holdable: true },
			],
		});
		expect((await client.listActions(1500)).map((a) => a.holdable)).toEqual([false, true]);
	});

	test("trigger OK", async () => {
		const client = await clientFor({ trigger: () => ({ status: 1 }) });
		expect(await client.trigger("emote_wave", 2000)).toEqual({ ok: true });
	});

	test("trigger refusé par le jeu", async () => {
		const client = await clientFor({ trigger: () => ({ status: 4, message: "trop vite" }) });
		expect(await client.trigger("emote_wave", 2000)).toMatchObject({
			ok: false,
			reason: "TRIGGER_GAME_ACTION_STATUS_RATE_LIMITED",
			message: "trop vite",
		});
	});

	test("statut inconnu", async () => {
		const client = await clientFor({ trigger: () => ({ status: 99 }) });
		expect(await client.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "STATUS_99" });
	});

	test("l'action envoyée est exactement celle demandée", async () => {
		const received: TriggerRequest[] = [];
		const client = await clientFor({ trigger: (req) => (received.push(req), { status: 1 }) });
		await client.trigger("emote_wave", 2000);
		expect(received).toEqual([{ action_name: "emote_wave" }]);
	});

	test("jeu absent : trigger échoue vite sans rejeter", async () => {
		const client = new GameClient(schema, CLOSED);
		cleanup.push(async () => client.close());
		const t0 = Date.now();
		const res = await client.trigger("emote_wave", 2000);
		expect(res.ok).toBe(false);
		expect(Date.now() - t0).toBeLessThan(2500);
	});

	test("jeu absent : listActions rejette en ≤ délai", async () => {
		const client = new GameClient(schema, CLOSED);
		cleanup.push(async () => client.close());
		const t0 = Date.now();
		await expect(client.listActions(1500)).rejects.toThrow();
		expect(Date.now() - t0).toBeLessThan(2000);
	});
});
