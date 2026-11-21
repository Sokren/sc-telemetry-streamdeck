import type { DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { beforeEach, describe, expect, test } from "vitest";
import { ShipCommandAction, type ShipCommandSettings } from "../../src/actions/ship-command-action.js";
import { ActionSource, readSnapshot } from "../../src/catalog/source.js";
import type { GameApi, TriggerResult } from "../../src/game/types.js";

const snapshot = readSnapshot(new URL("../../schema/actions.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

class FakeKey {
	calls: string[] = [];
	constructor(public settings: ShipCommandSettings = {}) {}
	isKey() {
		return true;
	}
	async setTitle(t?: string) {
		this.calls.push(`title:${t ?? ""}`);
	}
	async setSettings(s: ShipCommandSettings) {
		this.settings = s;
		this.calls.push(`settings:${JSON.stringify(s)}`);
	}
	async getSettings() {
		return this.settings;
	}
	async showOk() {
		this.calls.push("ok");
	}
	async showAlert() {
		this.calls.push("alert");
	}
}

let triggered: string[];
let toPI: JsonValue[];
let action: ShipCommandAction;
beforeEach(() => {
	triggered = [];
	toPI = [];
	const game: GameApi = {
		listActions: async () => snapshot,
		trigger: async (name): Promise<TriggerResult> => (triggered.push(name), { ok: true }),
		openStream: () => ({ cancel() {} }),
		close() {},
	};
	action = new ShipCommandAction({
		game,
		source: new ActionSource(game, () => snapshot),
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void toPI.push(p),
		log: () => {},
	});
});

const ev = <T>(key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as T;

describe("appui", () => {
	test.each<[string | undefined, string]>([
		["on", "v_lights_on"],
		["off", "v_lights_off"],
		["toggle", "v_lights"],
		[undefined, "v_lights"],
	])("Phares, mode %s → %s", async (mode, expected) => {
		const key = new FakeKey({ action: "group:lights", mode: mode as ShipCommandSettings["mode"] });
		await action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(key));
		expect(triggered).toEqual([expected]);
		expect(key.calls).toEqual(["ok"]);
	});

	test("commande unique : envoyée telle quelle (le mode est ignoré)", async () => {
		await action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(new FakeKey({ action: "v_flightready", mode: "off" })));
		expect(triggered).toEqual(["v_flightready"]);
	});

	test("action dangereuse : toujours refusée", async () => {
		const key = new FakeKey({ action: "v_self_destruct" });
		await action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(key));
		expect(triggered).toEqual([]);
		expect(key.calls).toEqual(["alert"]);
	});

	test("regroupement inconnu → ⚠, rien envoyé", async () => {
		const key = new FakeKey({ action: "group:inexistant" });
		await action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(key));
		expect(triggered).toEqual([]);
		expect(key.calls).toEqual(["alert"]);
	});
});

describe("touches déjà réglées", () => {
	test("ancienne commande v_lights_on → convertie en Phares / On, titre mis à jour", async () => {
		const key = new FakeKey({ action: "v_lights_on" });
		await action.onWillAppear(ev<WillAppearEvent<ShipCommandSettings>>(key));
		expect(key.settings).toEqual({ action: "group:lights", mode: "on" });
		expect(key.calls.at(-1)).toBe("title:Phares\nON");
		await action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(key));
		expect(triggered).toEqual(["v_lights_on"]);
	});

	test("commande unique déjà réglée → inchangée", async () => {
		const key = new FakeKey({ action: "v_flightready" });
		await action.onWillAppear(ev<WillAppearEvent<ShipCommandSettings>>(key));
		expect(key.calls).toEqual(["title:Prêt au vol"]);
	});
});

describe("titre", () => {
	test("regroupement : libellé court + mot du mode (rien en bascule)", async () => {
		const k1 = new FakeKey({ action: "group:gear", mode: "off" });
		await action.onDidReceiveSettings(ev<DidReceiveSettingsEvent<ShipCommandSettings>>(k1));
		expect(k1.calls).toEqual(["title:Train\nRENTRÉ"]);
		const k2 = new FakeKey({ action: "group:master_nav", mode: "on" });
		await action.onDidReceiveSettings(ev<DidReceiveSettingsEvent<ShipCommandSettings>>(k2));
		expect(k2.calls).toEqual(["title:Mode\nNAV"]);
		const k3 = new FakeKey({ action: "group:lights" });
		await action.onDidReceiveSettings(ev<DidReceiveSettingsEvent<ShipCommandSettings>>(k3));
		expect(k3.calls).toEqual(["title:Phares"]);
	});
});

describe("panneau", () => {
	test("getActions → liste avec regroupements", async () => {
		await action.onSendToPlugin({ action: new FakeKey({}), payload: { event: "getActions" } } as unknown as SendToPluginEvent<JsonValue, ShipCommandSettings>);
		const json = JSON.stringify(toPI[0]);
		expect(json).toContain("group:lights");
		expect(json).not.toContain('"v_lights_on"');
	});
});
