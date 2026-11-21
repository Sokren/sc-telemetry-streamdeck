import fs from "node:fs";
import type { DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { beforeEach, describe, expect, test } from "vitest";
import { ShipToggleAction, type ShipToggleSettings } from "../../src/actions/ship-toggle-action.js";
import type { TriggerResult } from "../../src/game/types.js";

type Obj = Record<string, unknown>;
const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8")) as { vehicle: Obj; actor: Obj };

class FakeHub {
	listeners = new Set<() => void>();
	sections: Record<string, Obj | undefined> = { vehicle: titan.vehicle, actor: titan.actor };
	subscribe(l: () => void) {
		this.listeners.add(l);
		return () => void this.listeners.delete(l);
	}
	section(name: string) {
		return this.sections[name];
	}
	emit() {
		for (const l of [...this.listeners]) l();
	}
}

class FakeKey {
	sent: string[] = [];
	images: string[] = [];
	constructor(public id: string) {}
	isKey() {
		return true;
	}
	isDial() {
		return false;
	}
	async setImage(img: string) {
		this.images.push(decodeURIComponent(img));
		this.sent.push("image");
	}
	async showOk() {
		this.sent.push("ok");
	}
	async showAlert() {
		this.sent.push("alert");
	}
}

let hub: FakeHub;
let triggered: [string, number][];
let result: TriggerResult;
let logs: string[];
let toPI: JsonValue[];
let action: ShipToggleAction;

const ev = <T>(key: FakeKey, settings: ShipToggleSettings) => ({ action: key, payload: { settings } }) as unknown as T;
const appear = (key: FakeKey, s: ShipToggleSettings = {}) => action.onWillAppear(ev<WillAppearEvent<ShipToggleSettings>>(key, s));
const press = (key: FakeKey, s: ShipToggleSettings = {}) => action.onKeyDown(ev<KeyDownEvent<ShipToggleSettings>>(key, s));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	hub = new FakeHub();
	triggered = [];
	result = { ok: true };
	logs = [];
	toPI = [];
	action = new ShipToggleAction({
		hub,
		game: { trigger: async (name, ms) => (triggered.push([name, ms]), result) },
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void toPI.push(p),
		log: (m) => void logs.push(m),
	});
});

describe("affichage", () => {
	test("apparition → abonnée, image du train sorti (réglages par défaut)", async () => {
		const key = new FakeKey("k1");
		await appear(key);
		expect(hub.listeners.size).toBe(1);
		expect(key.images.at(-1)).toContain(">SORTI<");
	});

	test("nouvelle frame (train rentré) → nouvelle image", async () => {
		const key = new FakeKey("k1");
		await appear(key);
		await new Promise((r) => setTimeout(r, 300));
		const v = structuredClone(titan.vehicle) as { state: { flight: { state: Obj } } };
		v.state.flight.state.gear = "VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTED";
		hub.sections.vehicle = v;
		hub.emit();
		await flush();
		expect(key.images.at(-1)).toContain(">RENTRÉ<");
	});

	test("changement de style ou de fonction → redessinée tout de suite", async () => {
		const key = new FakeKey("k1");
		await appear(key);
		await action.onDidReceiveSettings(ev<DidReceiveSettingsEvent<ShipToggleSettings>>(key, { function: "lights", style: "fill" }));
		expect(key.images).toHaveLength(2);
		expect(key.images.at(-1)).toContain(">Phares<");
	});

	test("hors du vaisseau → « — »", async () => {
		hub.sections.vehicle = undefined;
		const key = new FakeKey("k1");
		await appear(key);
		expect(key.images.at(-1)).toContain(">—<");
	});

	test("disparition → désabonnée", async () => {
		const key = new FakeKey("k1");
		await appear(key);
		await action.onWillDisappear(ev<WillDisappearEvent<ShipToggleSettings>>(key, {}));
		expect(hub.listeners.size).toBe(0);
	});
});

describe("appui", () => {
	test("train sorti, mode Bascule → rentrer (délai 2000 ms), ✔", async () => {
		const key = new FakeKey("k1");
		await press(key, { function: "gear" });
		expect(triggered).toEqual([["v_retract_landing_system", 2000]]);
		expect(key.sent).toEqual(["ok"]);
	});

	test("déjà dans l'état voulu → rien envoyé, ✔", async () => {
		const key = new FakeKey("k1");
		await press(key, { function: "gear", mode: "on" });
		expect(triggered).toEqual([]);
		expect(key.sent).toEqual(["ok"]);
	});

	test("fonction absente du vaisseau → ⚠ + journal, rien envoyé", async () => {
		const key = new FakeKey("k1");
		await press(key, { function: "doors_closed" });
		expect(triggered).toEqual([]);
		expect(key.sent).toEqual(["alert"]);
		expect(logs).toHaveLength(1);
	});

	test("jeu sans commandes d'actions (4.10) → ⚠ et journal explicite FR / EN", async () => {
		result = { ok: false, reason: "UNIMPLEMENTED" };
		const key = new FakeKey("k1");
		await press(key, { function: "lights" });
		expect(key.sent).toEqual(["alert"]);
		expect(logs[0]).toContain("Star Citizen 5.0");
		expect(logs[0]).toContain("5.0 required");
	});

	test("refus du jeu → ⚠ + journal", async () => {
		result = { ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_FILTERED" };
		const key = new FakeKey("k1");
		await press(key, { function: "lights" });
		expect(triggered).toEqual([["v_lights_on", 2000]]);
		expect(key.sent).toEqual(["alert"]);
		expect(logs[0]).toContain("TRIGGER_GAME_ACTION_STATUS_FILTERED");
	});

	test("réglages inconnus → train, bascule", async () => {
		await press(new FakeKey("k1"), { function: "v_self_destruct" as never, mode: "boum" as never, style: "x" as never });
		expect(triggered).toEqual([["v_retract_landing_system", 2000]]);
	});
});

describe("panneau", () => {
	test("getFunctions → 17 fonctions, noms complets en français", async () => {
		await action.onSendToPlugin({ action: new FakeKey("k1"), payload: { event: "getFunctions" } } as unknown as SendToPluginEvent<JsonValue, ShipToggleSettings>);
		const msg = toPI[0] as { event: string; items: { label: string; value: string }[] };
		expect(msg.event).toBe("getFunctions");
		expect(msg.items).toHaveLength(17);
		expect(msg.items[0]).toEqual({ label: "Train d'atterrissage", value: "gear" });
	});
});
