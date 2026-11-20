import type { KeyDownEvent, WillAppearEvent } from "@elgato/streamdeck";
import { describe, expect, test } from "vitest";
import { MorseAction, readSettings, type MorseSettings } from "../../src/actions/morse-action.js";
import { MorsePlayer } from "../../src/morse/player.js";

class FakeKey {
	calls: string[] = [];
	constructor(public settings: MorseSettings = {}) {}
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
}
const keyDown = (key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as KeyDownEvent<MorseSettings>;
const willAppear = (key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as WillAppearEvent<MorseSettings>;

/** Lecteur avec horloge simulée ; `hold` bloque les attentes jusqu'à l'arrêt. */
function setup(opts: { hold?: boolean; toggleOk?: boolean } = {}) {
	let toggles = 0;
	let t = 0;
	const player = new MorsePlayer(
		async () => (opts.toggleOk === false ? false : (toggles++, true)),
		(ms, signal) =>
			opts.hold
				? new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
				: Promise.resolve(void (t += ms)),
		() => t,
	);
	const logs: string[] = [];
	const action = new MorseAction({ player, log: (m) => void logs.push(m) });
	return { action, logs, player, toggles: () => toggles };
}

describe("MorseAction", () => {
	test("appui → émission complète, « ● » pendant, ✔ à la fin", async () => {
		const { action, toggles } = setup();
		const key = new FakeKey({ text: "sos" });
		await action.onKeyDown(keyDown(key));
		expect(toggles()).toBe(18);
		expect(key.calls).toEqual(["title:● SOS", "title:SOS", "ok"]);
	});

	test("réglages vides → SOS par défaut", async () => {
		const { action, toggles } = setup();
		await action.onKeyDown(keyDown(new FakeKey({})));
		expect(toggles()).toBe(18);
	});

	test("appui sur une autre touche Morse pendant l'émission → arrêt, pas de 2e émission", async () => {
		const { action, player, toggles } = setup({ hold: true });
		const a = new FakeKey({ text: "E" });
		const b = new FakeKey({ text: "T" });
		const first = action.onKeyDown(keyDown(a));
		while (!player.playing) await new Promise((r) => setTimeout(r, 0));
		await action.onKeyDown(keyDown(b));
		await first;
		expect(toggles()).toBe(2); // allumage du 1er signe + remise en état
		expect(b.calls).toEqual([]);
		expect(a.calls).toEqual(["title:● E", "title:E"]);
	});

	test("double appui immédiat → une seule émission, arrêtée par le 2e appui", async () => {
		const { action, toggles } = setup({ hold: true });
		const key = new FakeKey({ text: "E" });
		const first = action.onKeyDown(keyDown(key));
		const second = action.onKeyDown(keyDown(key)); // sans attendre le moindre tick
		await Promise.all([first, second]);
		expect(toggles()).toBeLessThanOrEqual(2);
		expect(key.calls.filter((c) => c === "title:● E")).toHaveLength(1);
	});

	test("texte sans caractère émettable → ⚠ sans appel au jeu", async () => {
		const { action, toggles } = setup();
		const key = new FakeKey({ text: "???" });
		await action.onKeyDown(keyDown(key));
		expect(toggles()).toBe(0);
		expect(key.calls).toEqual(["alert"]);
	});

	test("bascule en échec → ⚠ et journal", async () => {
		const { action, logs } = setup({ toggleOk: false });
		const key = new FakeKey({ text: "E" });
		await action.onKeyDown(keyDown(key));
		expect(key.calls).toEqual(["title:● E", "title:E", "alert"]);
		expect(logs).toHaveLength(1);
	});

	test("apparition → titre = texte normalisé", async () => {
		const { action } = setup();
		const key = new FakeKey({ text: "été" });
		await action.onWillAppear(willAppear(key));
		expect(key.calls).toEqual(["title:ETE"]);
	});
});

describe("readSettings", () => {
	test("valeurs par défaut", () => {
		expect(readSettings({})).toEqual({ text: "SOS", unitMs: 400, repeat: 1 });
	});
	test("bornes", () => {
		expect(readSettings({ text: "a", unitMs: 10, repeat: 99 })).toEqual({ text: "a", unitMs: 100, repeat: 10 });
		expect(readSettings({ unitMs: 5000, repeat: 0 })).toMatchObject({ unitMs: 2000, repeat: 1 });
	});
	test("valeurs saisies en texte ou invalides", () => {
		expect(readSettings({ unitMs: "250" as unknown as number, repeat: "3" as unknown as number })).toMatchObject({ unitMs: 250, repeat: 3 });
		expect(readSettings({ unitMs: "abc" as unknown as number, text: "  " })).toEqual({ text: "SOS", unitMs: 400, repeat: 1 });
	});
});
