import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { GameClient } from "../../src/game/client.js";
import { createGameApi } from "../../src/game/create.js";
import { loadSchema } from "../../src/game/schema.js";
import type { TelemetryFrame } from "../../src/game/types.js";
import { DESC_PATH, startFakeGame, type FakeHandlers } from "./fake-server.js";

const schema = loadSchema(fileURLToPath(DESC_PATH));
let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	await Promise.all(cleanup.map((f) => f()));
	cleanup = [];
});

async function clientFor(h: FakeHandlers): Promise<GameClient> {
	const game = await startFakeGame(h);
	const client = new GameClient(schema, `127.0.0.1:${game.port}`);
	cleanup.push(async () => (client.close(), game.stop()));
	return client;
}

/** Ouvre le flux et attend sa fin (ou un délai). */
function collect(client: GameClient, ms = 3000): Promise<{ frames: TelemetryFrame[]; ends: (Error | undefined)[] }> {
	const frames: TelemetryFrame[] = [];
	const ends: (Error | undefined)[] = [];
	return new Promise((resolve) => {
		client.openStream(
			(f) => frames.push(f),
			(err) => {
				ends.push(err);
				setTimeout(() => resolve({ frames, ends }), 50);
			},
		);
		setTimeout(() => resolve({ frames, ends }), ms);
	});
}

describe("GameClient.openStream", () => {
	test("reçoit les frames ; section absente = clé absente ; fin normale → onEnd() une fois", async () => {
		const client = await clientFor({
			frames: [{ actor: { vitals: { health: { current: 100, max: 100 } } } }, { vehicle: { state: { name: "Cutlass" } } }],
		});
		const { frames, ends } = await collect(client);
		expect(frames).toHaveLength(2);
		expect(frames[0]).toEqual({ actor: { vitals: { health: { current: 100, max: 100 } } } });
		expect("vehicle" in frames[0]).toBe(false);
		expect(ends).toEqual([undefined]);
	});

	test("int64 (solde) décodé en chaîne, enums en texte, champs à 0 absents", async () => {
		const client = await clientFor({
			frames: [{ actor: { state: { uec_balance: "15001986", locomotion: 1 }, vitals: { hunger: { current: 0, max: 100 } } } }],
		});
		const { frames } = await collect(client);
		const actor = frames[0].actor as { state: Record<string, unknown>; vitals: { hunger: Record<string, unknown> } };
		expect(actor.state.uec_balance).toBe("15001986");
		expect(actor.state.locomotion).toBe("ACTOR_LOCOMOTION_STATE_ON_FOOT");
		expect(actor.vitals.hunger).toEqual({ max: 100 });
	});

	test("erreur du flux → onEnd(err)", async () => {
		const client = await clientFor({ frames: [], streamError: true });
		const { ends } = await collect(client);
		expect(ends).toHaveLength(1);
		expect(ends[0]).toBeInstanceOf(Error);
	});

	test("jeu absent → onEnd(err)", async () => {
		const client = new GameClient(schema, "127.0.0.1:1");
		cleanup.push(async () => client.close());
		const { ends } = await collect(client);
		expect(ends).toHaveLength(1);
		expect(ends[0]).toBeInstanceOf(Error);
	});

	test("cancel() → plus de frame ni d'onEnd", async () => {
		const client = await clientFor({ frames: [{ actor: {} }], holdOpen: true });
		let ended = 0;
		const sub = client.openStream(
			() => {},
			() => ended++,
		);
		await new Promise((r) => setTimeout(r, 200));
		sub.cancel();
		await new Promise((r) => setTimeout(r, 200));
		expect(ended).toBe(0);
	});

	test("schéma indisponible → onEnd(err) sans plantage", async () => {
		const api = createGameApi("introuvable.desc", () => {});
		const err = await new Promise<Error | undefined>((resolve) => api.openStream(() => {}, resolve));
		expect(err).toBeInstanceOf(Error);
	});
});
