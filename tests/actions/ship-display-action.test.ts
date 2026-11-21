import type { DialRotateEvent, DidReceiveSettingsEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { beforeEach, describe, expect, test } from "vitest";
import { ShipDisplay, type ShipDisplaySettings } from "../../src/actions/ship-display.js";

/** Faux hub : sections du flux (capture du Prospector : 48 leurres, 5 brouilleurs). */
class FakeHub {
	listeners = new Set<() => void>();
	sections: Record<string, Record<string, unknown> | undefined> = {
		weapons: {
			countermeasures: [
				{ type: "COUNTERMEASURE_TYPE_DECOY", amount: 48 },
				{ type: "COUNTERMEASURE_TYPE_NOISE", amount: 5 },
			],
		},
		vehicle: { state: { class_name: "MISC_Prospector" } },
		actor: { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } },
	};
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
	setCm(decoy: number, noise: number) {
		this.sections.weapons = {
			countermeasures: [
				{ type: "COUNTERMEASURE_TYPE_DECOY", amount: decoy },
				{ type: "COUNTERMEASURE_TYPE_NOISE", amount: noise },
			],
		};
	}
}

class FakeAction {
	sent: string[] = [];
	settings: ShipDisplaySettings = {};
	constructor(
		public id: string,
		private dial = false,
	) {}
	isKey() {
		return !this.dial;
	}
	isDial() {
		return this.dial;
	}
	async setImage(img: string) {
		const svg = decodeURIComponent(img);
		this.sent.push(`image:${[...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).join("|")}`);
	}
	async setFeedback(f: { value: string; label: string }) {
		this.sent.push(`feedback:${f.label}=${f.value}`);
	}
	async setFeedbackLayout(layout: string) {
		this.sent.push(`layout:${layout}`);
	}
	async setSettings(s: ShipDisplaySettings) {
		this.settings = s;
		this.sent.push(`settings:${s.value}`);
	}
}

let hub: FakeHub;
let now: number;
let scheduled: { fn: () => void; at: number }[];
let toPI: JsonValue[];
let action: ShipDisplay;

const appear = (a: FakeAction, settings: ShipDisplaySettings = {}) =>
	action.onWillAppear({ action: a, payload: { settings } } as unknown as WillAppearEvent<ShipDisplaySettings>);
const disappear = (a: FakeAction) => action.onWillDisappear({ action: a } as unknown as WillDisappearEvent<ShipDisplaySettings>);
const rotate = (a: FakeAction, ticks: number) =>
	action.onDialRotate({ action: a, payload: { ticks, settings: a.settings } } as unknown as DialRotateEvent<ShipDisplaySettings>);
const flush = () => new Promise((r) => setTimeout(r, 0));
async function advance(ms: number) {
	now += ms;
	const due = scheduled.filter((s) => s.at <= now);
	scheduled = scheduled.filter((s) => s.at > now);
	for (const s of due) s.fn();
	await flush();
}

beforeEach(() => {
	hub = new FakeHub();
	now = 1000;
	scheduled = [];
	toPI = [];
	action = new ShipDisplay({
		hub,
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void toPI.push(p),
		now: () => now,
		schedule: (fn, ms) => void scheduled.push({ fn, at: now + ms }),
	});
});

describe("Ship Display", () => {
	test("touche : abonnée, contre-mesures par défaut (« 48 / 5 »)", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		expect(hub.listeners.size).toBe(1);
		expect(key.sent).toEqual(["image:C-mesures|48 / 5"]);
	});

	test("molette : mise en page d'Actor Display puis écran", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "decoys" });
		expect(dial.sent).toEqual(["layout:layouts/actor-display.json", "feedback:Leurres=48"]);
	});

	test("lancers en jeu : la touche suit (45 / 3)", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		await advance(300);
		hub.setCm(45, 3);
		hub.emit();
		await flush();
		expect(key.sent.at(-1)).toBe("image:C-mesures|45 / 3");
	});

	test("jeu fermé (sections périmées) → « — »", async () => {
		const key = new FakeAction("k1");
		await appear(key, { value: "noise" });
		await advance(300);
		hub.sections = {};
		hub.emit();
		await flush();
		expect(key.sent.at(-1)).toBe("image:Brouill.|—");
	});

	test("réglage inconnu → contre-mesures ; changement de réglage → nouveau rendu", async () => {
		const key = new FakeAction("k1");
		await appear(key, { value: "oxygen" as never });
		expect(key.sent).toEqual(["image:C-mesures|48 / 5"]);
		await action.onDidReceiveSettings({ action: key, payload: { settings: { value: "noise" } } } as unknown as DidReceiveSettingsEvent<ShipDisplaySettings>);
		expect(key.sent.at(-1)).toBe("image:Brouill.|5");
	});

	test("molette : +1 et −1 en boucle sur les 6 valeurs, réglage enregistré", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "noise" });
		dial.settings = { value: "noise" };
		await rotate(dial, 1);
		expect(dial.settings).toEqual({ value: "weapons" });
		await rotate(dial, 2);
		expect(dial.settings).toEqual({ value: "gimbals" });
		await rotate(dial, 1);
		expect(dial.settings).toEqual({ value: "countermeasures" });
		await rotate(dial, -1);
		expect(dial.settings).toEqual({ value: "gimbals" });
	});

	test("disparition → désabonnement", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		await disappear(key);
		expect(hub.listeners.size).toBe(0);
	});

	test("getValues → 6 valeurs, libellés longs en français", async () => {
		await action.onSendToPlugin({ action: new FakeAction("k1"), payload: { event: "getValues" } } as unknown as SendToPluginEvent<JsonValue, ShipDisplaySettings>);
		expect(toPI[0]).toEqual({
			event: "getValues",
			items: [
				{ label: "Contre-mesures (leurres / brouilleurs)", value: "countermeasures" },
				{ label: "Leurres", value: "decoys" },
				{ label: "Brouilleurs", value: "noise" },
				{ label: "Armes prêtes à tirer", value: "weapons" },
				{ label: "Groupe d'armes actif", value: "weapon_group" },
				{ label: "Cardans", value: "gimbals" },
			],
		});
	});
});
