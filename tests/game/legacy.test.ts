import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { GameClient } from "../../src/game/client.js";
import { loadSchema } from "../../src/game/schema.js";
import { DESC_PATH, startFakeGame } from "./fake-server.js";

const schema = loadSchema(fileURLToPath(DESC_PATH));
let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

describe("jeu 4.10 (flux seulement, sans commandes d'actions)", () => {
	test("liste des actions refusée par le jeu avec le code UNIMPLEMENTED (12)", async () => {
		const game = await startFakeGame({ legacy: true });
		const client = new GameClient(schema, `127.0.0.1:${game.port}`);
		stop = async () => (client.close(), game.stop());
		await expect(client.listActions(1500)).rejects.toMatchObject({ code: 12 });
		expect(await client.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "UNIMPLEMENTED" });
	});
});
