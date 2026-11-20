import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { GameClient } from "../../src/game/client.js";
import { createGameApi } from "../../src/game/create.js";
import { DESC_PATH } from "./fake-server.js";

describe("createGameApi", () => {
	test("schéma valide → client gRPC", () => {
		const logs: string[] = [];
		const api = createGameApi(fileURLToPath(DESC_PATH), (m) => void logs.push(m));
		expect(api).toBeInstanceOf(GameClient);
		expect(logs).toEqual([]);
		api.close();
	});

	test("schéma absent → pas de plantage : liste refusée, appui en échec « SCHEMA », erreur journalisée", async () => {
		const logs: string[] = [];
		const api = createGameApi("introuvable.desc", (m) => void logs.push(m));
		await expect(api.listActions(1500)).rejects.toThrow();
		expect(await api.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "SCHEMA" });
		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("introuvable.desc");
	});

	test("schéma illisible → même repli", async () => {
		const api = createGameApi(fileURLToPath(new URL("../../schema/actions.json", import.meta.url)), () => {});
		expect(await api.trigger("emote_wave", 2000)).toMatchObject({ ok: false, reason: "SCHEMA" });
	});
});
