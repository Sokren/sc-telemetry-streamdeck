import type { KeyDownEvent, SendToPluginEvent, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { beforeEach, describe, expect, test } from "vitest";
import { CategoryAction, type ActionSettings } from "../../src/actions/category-action.js";
import { ACTOR_GROUPS } from "../../src/catalog/dropdown.js";
import { ActionSource } from "../../src/catalog/source.js";
import type { GameAction, GameApi, TriggerResult } from "../../src/game/types.js";

const ACTIONS: GameAction[] = [
	{ name: "emote_wave", category: "player_emotes", holdable: false },
	{ name: "mobiglas", category: "player", holdable: false },
	{ name: "v_self_destruct", category: "spaceship_general", holdable: false },
];

class FakeGame implements GameApi {
	triggered: [string, number][] = [];
	listCalls = 0;
	result: TriggerResult = { ok: true };
	async listActions(): Promise<GameAction[]> {
		this.listCalls++;
		return ACTIONS;
	}
	async trigger(name: string, timeoutMs: number): Promise<TriggerResult> {
		this.triggered.push([name, timeoutMs]);
		return this.result;
	}
	openStream() {
		return { cancel() {} };
	}
	close(): void {}
}

/** Touche simulée : enregistre ce que le plugin lui demande d'afficher. */
class FakeKey {
	calls: string[] = [];
	constructor(public settings: ActionSettings = {}) {}
	isKey() {
		return true;
	}
	async setTitle(title?: string) {
		this.calls.push(`title:${title ?? ""}`);
	}
	async showOk() {
		this.calls.push("ok");
	}
	async showAlert() {
		this.calls.push("alert");
	}
	async getSettings() {
		return this.settings;
	}
}

class TestAction extends CategoryAction {}

let game: FakeGame;
let sent: JsonValue[];
let logs: string[];
let action: TestAction;

beforeEach(() => {
	game = new FakeGame();
	sent = [];
	logs = [];
	action = new TestAction({
		game,
		source: new ActionSource(game, () => []),
		groups: ACTOR_GROUPS,
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void sent.push(p),
		log: (m) => void logs.push(m),
	});
});

const keyDown = (key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as KeyDownEvent<ActionSettings>;
const willAppear = (key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as WillAppearEvent<ActionSettings>;
const fromPI = (key: FakeKey, payload: JsonValue) =>
	({ action: key, payload }) as unknown as SendToPluginEvent<JsonValue, ActionSettings>;

describe("appui sur la touche", () => {
	test("sans action choisie → ⚠, aucun appel au jeu", async () => {
		const key = new FakeKey({});
		await action.onKeyDown(keyDown(key));
		expect(key.calls).toEqual(["alert"]);
		expect(game.triggered).toEqual([]);
	});

	test("déclenche exactement l'action enregistrée, délai 2000 ms ; succès → ✔", async () => {
		const key = new FakeKey({ action: "emote_wave" });
		await action.onKeyDown(keyDown(key));
		expect(game.triggered).toEqual([["emote_wave", 2000]]);
		expect(key.calls).toEqual(["ok"]);
	});

	test("refus du jeu → ⚠ et une ligne de journal avec action, raison et message", async () => {
		game.result = { ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_MAP_INACTIVE", message: "carte inactive" };
		const key = new FakeKey({ action: "emote_wave" });
		await action.onKeyDown(keyDown(key));
		expect(key.calls).toEqual(["alert"]);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("emote_wave");
		expect(logs[0]).toContain("TRIGGER_GAME_ACTION_STATUS_MAP_INACTIVE");
		expect(logs[0]).toContain("carte inactive");
	});

	test("jeu injoignable → ⚠ et la liste du jeu sera redemandée", async () => {
		const source = (action as unknown as { deps: { source: ActionSource } }).deps.source;
		await source.getActions();
		game.result = { ok: false, reason: "UNAVAILABLE" };
		await action.onKeyDown(keyDown(new FakeKey({ action: "emote_wave" })));
		await source.getActions();
		expect(game.listCalls).toBe(2);
	});
});

describe("actions dangereuses", () => {
	test.each(["v_self_destruct", "v_eject", "v_emergency_exit", "v_power_set_off", "v_power_toggle", "v_open_all_doors", "v_toggle_all_doors", "v_unlock_all_doors", "v_unlock_all_ports"])(
		"%s enregistrée (profil importé) → refusée : ⚠, journal, aucun appel au jeu",
		async (name) => {
			const key = new FakeKey({ action: name });
			await action.onKeyDown(keyDown(key));
			expect(game.triggered).toEqual([]);
			expect(key.calls).toEqual(["alert"]);
			expect(logs[0]).toContain(name);
		},
	);
});

describe("titre", () => {
	test("apparition → titre = libellé de l'action", async () => {
		const key = new FakeKey({ action: "emote_wave" });
		await action.onWillAppear(willAppear(key));
		expect(key.calls).toEqual(["title:Faire coucou"]);
	});

	test("apparition sans action → titre vide", async () => {
		const key = new FakeKey({});
		await action.onWillAppear(willAppear(key));
		expect(key.calls).toEqual(["title:"]);
	});

	test("changement de réglage → nouveau titre", async () => {
		const key = new FakeKey({ action: "mobiglas" });
		await action.onDidReceiveSettings(willAppear(key) as never);
		expect(key.calls).toEqual(["title:mobiGlas"]);
	});
});

describe("panneau de réglage", () => {
	test("getActions → liste groupée, sans les autres catégories", async () => {
		await action.onSendToPlugin(fromPI(new FakeKey({ action: "emote_wave" }), { event: "getActions" }));
		expect(sent).toHaveLength(1);
		const msg = sent[0] as { event: string; items: { label: string }[] };
		expect(msg.event).toBe("getActions");
		expect(msg.items.map((i) => i.label)).toEqual(["Personnage", "Émotes"]);
		expect(JSON.stringify(msg)).not.toContain("v_self_destruct");
	});

	test("getActions avec une action enregistrée disparue → elle reste proposée", async () => {
		await action.onSendToPlugin(fromPI(new FakeKey({ action: "emote_retired" }), { event: "getActions" }));
		const msg = sent[0] as { items: { label: string; value?: string }[] };
		expect(msg.items[0]).toEqual({ label: "Retired (indisponible)", value: "emote_retired" });
	});

	test("autre message → ignoré", async () => {
		await action.onSendToPlugin(fromPI(new FakeKey({}), { event: "autre" }));
		await action.onSendToPlugin(fromPI(new FakeKey({}), "texte"));
		expect(sent).toEqual([]);
	});
});
