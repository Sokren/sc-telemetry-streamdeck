import fs from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { renderShipKey, toShipView } from "../../src/ship/render.js";
import { readShipState } from "../../src/ship/state.js";
import { DEFAULT_LAYOUT, type Tile } from "../../src/web/layout.js";
import { pressTile, renderTile } from "../../src/web/tiles.js";
import { MorseControl } from "../../src/web/morse-control.js";
import type { TriggerRequest } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

type Obj = Record<string, unknown>;
const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8")) as { vehicle: Obj; actor: Obj };
const hub = { section: (n: string) => (n === "vehicle" ? titan.vehicle : n === "actor" ? titan.actor : undefined) };
const svg = (uri: string) => decodeURIComponent(uri.slice("data:image/svg+xml;charset=utf8,".length));

function fakeGame() {
	const sent: string[] = [];
	return { sent, trigger: async (name: string) => (sent.push(name), { ok: true as const }) };
}
const ctx = (lang: "fr" | "en" = "fr") => {
	const game = fakeGame();
	return { game, hub, lang, morse: new MorseControl(game) };
};

describe("grille par défaut", () => {
	test("10 tuiles prévues par la conception", () => {
		expect(DEFAULT_LAYOUT.map((t) => [t.type, Object.values(t.settings)[0]])).toEqual([
			["ship-toggle", "gear"], ["ship-toggle", "lights"], ["ship-toggle", "decoupled"], ["ship-toggle", "master_nav"],
			["ship-toggle", "power_engines"], ["actor-display", "oxygen"], ["actor-display", "health"],
			["actor-display", "body_temperature"], ["actor-action", "emote_wave"], ["morse", "SOS"],
		]);
	});
});

describe("renderTile", () => {
	test("interrupteur vaisseau : image identique à la touche Ship Toggle", () => {
		const tile: Tile = { type: "ship-toggle", settings: { function: "gear", style: "led" } };
		expect(renderTile(tile, ctx())).toBe(renderShipKey(toShipView("gear", readShipState("gear", titan.vehicle, titan.actor), "fr"), "led"));
	});

	test("chaque type a une image avec son libellé, en français et en anglais", () => {
		const cases: [Tile, string, string][] = [
			[{ type: "actor-action", settings: { action: "emote_wave" } }, "Faire coucou", "Wave"],
			[{ type: "ship-action", settings: { action: "v_flightready" } }, "Prêt au vol", "Flight ready"],
			[{ type: "ship-action", settings: { action: "group:lights", mode: "on" } }, "Phares", "Lights"],
			[{ type: "actor-display", settings: { value: "heart_rate" } }, "Cœur", "Heart"],
			[{ type: "morse", settings: { text: "sos" } }, "SOS", "SOS"],
		];
		for (const [tile, fr, en] of cases) {
			expect(svg(renderTile(tile, ctx("fr"))), tile.type).toContain(fr);
			expect(svg(renderTile(tile, ctx("en"))), tile.type).toContain(en);
		}
	});

	test("tuile morse : « ● » pendant l'émission", () => {
		const c = ctx();
		const tile: Tile = { type: "morse", settings: { text: "SOS" } };
		expect(svg(renderTile(tile, c))).not.toContain("●");
		c.morse.start({ text: "SOS", unitMs: 2000 });
		expect(svg(renderTile(tile, c))).toContain("●");
		c.morse.stop();
	});

	test("libellé échappé dans l'image", () => {
		expect(svg(renderTile({ type: "morse", settings: { text: "A<B" } }, ctx()))).not.toContain("<B");
	});
});

describe("pressTile", () => {
	test("interrupteur train (sorti) → rentrer", async () => {
		const c = ctx();
		expect(await pressTile({ type: "ship-toggle", settings: { function: "gear" } }, c)).toEqual({ feedback: "ok" });
		expect(c.game.sent).toEqual(["v_retract_landing_system"]);
	});

	test("action perso et commande vaisseau regroupée", async () => {
		const c = ctx();
		await pressTile({ type: "actor-action", settings: { action: "emote_wave" } }, c);
		await pressTile({ type: "ship-action", settings: { action: "group:lights", mode: "off" } }, c);
		expect(c.game.sent).toEqual(["emote_wave", "v_lights_off"]);
	});

	test("action dangereuse trafiquée dans la grille → ⚠, rien envoyé", async () => {
		const c = ctx();
		for (const tile of [
			{ type: "actor-action", settings: { action: "v_self_destruct" } },
			{ type: "ship-action", settings: { action: "v_open_all_doors" } },
		] as Tile[]) {
			expect(await pressTile(tile, c)).toMatchObject({ feedback: "alert" });
		}
		expect(c.game.sent).toEqual([]);
	});

	test("fonction absente du vaisseau → ⚠ ; afficheur → rien envoyé", async () => {
		const c = ctx();
		expect(await pressTile({ type: "ship-toggle", settings: { function: "doors_closed" } }, c)).toEqual({ feedback: "alert", detail: "unavailable" });
		expect(await pressTile({ type: "actor-display", settings: { value: "oxygen" } }, c)).toEqual({ feedback: "ok" });
		expect(c.game.sent).toEqual([]);
	});

	test("morse : un appui lance, un second arrête", async () => {
		const c = ctx();
		const tile: Tile = { type: "morse", settings: { text: "E", unitMs: 2000 } };
		await pressTile(tile, c);
		expect(c.morse.playing).toBe(true);
		await pressTile(tile, c);
		for (let i = 0; i < 50 && c.morse.playing; i++) await new Promise((r) => setTimeout(r, 10));
		expect(c.morse.playing).toBe(false);
	});
});

describe("API grille", () => {
	let s: TestServer | undefined;
	afterEach(async () => {
		await s?.close();
		s = undefined;
	});

	test("GET /api/v1/layout : 10 tuiles avec image ; appui ; index inconnu → 404", async () => {
		const sent: TriggerRequest[] = [];
		s = await startTestServer({ game: { trigger: (r) => (sent.push(r), { status: 1 }) } });
		const r = await s.call("GET", "/api/v1/layout?lang=fr");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/layout", "GET", 200, r.body);
		expect(r.body.tiles).toHaveLength(10);
		expect(r.body.tiles[0].image).toMatch(/^data:image\/svg\+xml/);
		const press = await s.call("POST", "/api/v1/layout/tiles/8/press");
		expect(press.status).toBe(200);
		validateResponse("/api/v1/layout/tiles/{index}/press", "POST", 200, press.body);
		expect(sent).toEqual([{ action_name: "emote_wave" }]);
		const bad = await s.call("POST", "/api/v1/layout/tiles/99/press");
		expect(bad.status).toBe(404);
	});
});
