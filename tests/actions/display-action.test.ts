import type { DialRotateEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { beforeEach, describe, expect, test } from "vitest";
import { DisplayAction, type DisplaySettings } from "../../src/actions/display-action.js";

class FakeHub {
	listeners = new Set<() => void>();
	actor: Record<string, unknown> | undefined = { vitals: { oxygen: { current: 1, max: 1 }, heart_rate: 70 } };
	subscribe(l: () => void) {
		this.listeners.add(l);
		return () => void this.listeners.delete(l);
	}
	section(name: string) {
		return name === "actor" ? this.actor : undefined;
	}
	emit() {
		for (const l of [...this.listeners]) l();
	}
}

/** Touche ou molette simulée : enregistre ce que le plugin lui envoie. */
class FakeAction {
	sent: string[] = [];
	settings: DisplaySettings = {};
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
		this.sent.push(`image:${decodeURIComponent(img).includes(">100<") ? "O2=100" : "autre"}`);
	}
	async setFeedback(f: { value: string; label: string }) {
		this.sent.push(`feedback:${f.label}=${f.value}`);
	}
	async setFeedbackLayout(layout: string) {
		this.sent.push(`layout:${layout}`);
	}
	async setSettings(s: DisplaySettings) {
		this.settings = s;
		this.sent.push(`settings:${s.value}`);
	}
}

let hub: FakeHub;
let now: number;
let scheduled: { fn: () => void; at: number }[];
let toPI: JsonValue[];
let action: DisplayAction;

const appear = (a: FakeAction, settings: DisplaySettings = {}) =>
	action.onWillAppear({ action: a, payload: { settings } } as unknown as WillAppearEvent<DisplaySettings>);
const disappear = (a: FakeAction) => action.onWillDisappear({ action: a } as unknown as WillDisappearEvent<DisplaySettings>);
const rotate = (a: FakeAction, ticks: number) =>
	action.onDialRotate({ action: a, payload: { ticks, settings: a.settings } } as unknown as DialRotateEvent<DisplaySettings>);
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));
/** Avance l'horloge simulée et exécute les envois différés arrivés à échéance. */
async function advance(ms: number) {
	now += ms;
	const due = scheduled.filter((s) => s.at <= now);
	scheduled = scheduled.filter((s) => s.at > now);
	for (const s of due) s.fn();
	await flushMicrotasks();
}

beforeEach(() => {
	hub = new FakeHub();
	now = 1000;
	scheduled = [];
	toPI = [];
	action = new DisplayAction({
		hub,
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void toPI.push(p),
		now: () => now,
		schedule: (fn, ms) => void scheduled.push({ fn, at: now + ms }),
	});
});

describe("apparition et disparition", () => {
	test("touche : abonnée au hub et image envoyée tout de suite (oxygène par défaut)", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		expect(hub.listeners.size).toBe(1);
		expect(key.sent).toEqual(["image:O2=100"]);
	});

	test("molette : mise en page d'abord, puis contenu de l'écran", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "heart_rate" });
		expect(dial.sent).toEqual(["layout:layouts/actor-display.json", "feedback:Rythme cardiaque=70 bpm"]);
	});

	test("disparition → désabonnement (le hub peut fermer le flux)", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		await disappear(key);
		expect(hub.listeners.size).toBe(0);
	});

	test("réglage inconnu → oxygène", async () => {
		const key = new FakeAction("k1");
		await appear(key, { value: "v_self_destruct" as never });
		expect(key.sent).toEqual(["image:O2=100"]);
	});
});

describe("mise à jour", () => {
	test("nouvelle frame avec une autre valeur → nouveau rendu", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "heart_rate" });
		await advance(300);
		hub.actor = { vitals: { heart_rate: 90 } };
		hub.emit();
		await flushMicrotasks();
		expect(dial.sent.at(-1)).toBe("feedback:Rythme cardiaque=90 bpm");
	});

	test("même rendu → rien n'est renvoyé", async () => {
		const key = new FakeAction("k1");
		await appear(key);
		await advance(300);
		hub.emit();
		hub.emit();
		await flushMicrotasks();
		expect(key.sent).toHaveLength(1);
	});

	test("deux changements en < 250 ms → un envoi immédiat puis un envoi différé du dernier état", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "heart_rate" }); // envoi à t=1000
		await advance(100);
		hub.actor = { vitals: { heart_rate: 80 } };
		hub.emit();
		hub.actor = { vitals: { heart_rate: 85 } };
		hub.emit();
		await flushMicrotasks();
		expect(dial.sent.filter((s) => s.startsWith("feedback"))).toHaveLength(1); // rien de plus avant 250 ms
		await advance(150);
		expect(dial.sent.at(-1)).toBe("feedback:Rythme cardiaque=85 bpm");
		expect(dial.sent.filter((s) => s.startsWith("feedback"))).toHaveLength(2);
	});

	test("jeu fermé (section périmée) → « — »", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "heart_rate" });
		await advance(300);
		hub.actor = undefined;
		hub.emit();
		await flushMicrotasks();
		expect(dial.sent.at(-1)).toBe("feedback:Rythme cardiaque=—");
	});

	test("action disparue : un envoi différé en attente n'est pas exécuté", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "heart_rate" });
		hub.actor = { vitals: { heart_rate: 80 } };
		hub.emit();
		await disappear(dial);
		await advance(300);
		expect(dial.sent.filter((s) => s.startsWith("feedback"))).toHaveLength(1);
	});
});

describe("rotation de la molette", () => {
	test("+1 depuis le solde → santé (en boucle), réglage enregistré, nouveau rendu", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "balance" });
		dial.settings = { value: "balance" };
		await advance(300);
		await rotate(dial, 1);
		expect(dial.settings).toEqual({ value: "health" });
		expect(dial.sent.at(-1)).toMatch(/^feedback:Santé=/);
	});

	test("−3 depuis l'oxygène → atmosphère respirable", async () => {
		const dial = new FakeAction("d1", true);
		await appear(dial, { value: "oxygen" });
		dial.settings = { value: "oxygen" };
		await rotate(dial, -3);
		expect(dial.settings).toEqual({ value: "breathable" });
	});
});

describe("panneau de réglage", () => {
	test("getValues → 13 données avec libellés longs en français", async () => {
		await action.onSendToPlugin({ action: new FakeAction("k1"), payload: { event: "getValues" } } as unknown as SendToPluginEvent<JsonValue, DisplaySettings>);
		const msg = toPI[0] as { event: string; items: { label: string; value: string }[] };
		expect(msg.event).toBe("getValues");
		expect(msg.items).toHaveLength(13);
		expect(msg.items[1]).toEqual({ label: "Oxygène", value: "oxygen" });
	});

	test("autre message → ignoré", async () => {
		await action.onSendToPlugin({ action: new FakeAction("k1"), payload: { event: "x" } } as unknown as SendToPluginEvent<JsonValue, DisplaySettings>);
		expect(toPI).toEqual([]);
	});
});
