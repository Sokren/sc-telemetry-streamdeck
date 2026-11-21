import { beforeEach, describe, expect, test } from "vitest";
import { createAutoSwitch, parseAutoSettings } from "../../src/web/static/autoswitch.js";

type Settings = { enabled: boolean; on_foot: string; seated: string; eva: string };

let timers: { fn: () => void; at: number; id: number }[];
let now: number;
let applied: string[];
let editing: boolean;
let settings: Settings;
let views: string[];
let nextId: number;

function make(skipInitial = false) {
	return createAutoSwitch({
		delayMs: 2000,
		setTimer: (fn: () => void, ms: number) => {
			const id = nextId++;
			timers.push({ fn, at: now + ms, id });
			return id;
		},
		clearTimer: (id: number) => {
			timers = timers.filter((t) => t.id !== id);
		},
		getSettings: () => settings,
		viewExists: (id: string) => views.includes(id),
		isEditing: () => editing,
		apply: (id: string) => applied.push(id),
		skipInitial,
	});
}
function advance(ms: number) {
	now += ms;
	for (;;) {
		const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
		if (!due) break;
		timers = timers.filter((t) => t !== due);
		due.fn();
	}
}

beforeEach(() => {
	timers = [];
	now = 0;
	applied = [];
	editing = false;
	nextId = 1;
	views = ["foot", "ship", "space"];
	settings = { enabled: true, on_foot: "foot", seated: "ship", eva: "space" };
});

describe("changement de vue automatique", () => {
	test("à pied puis assis : bascule après 2 s de position stable", () => {
		const a = make();
		a.update("on_foot");
		advance(1999);
		expect(applied).toEqual([]);
		advance(1);
		expect(applied).toEqual(["foot"]);
		a.update("seated");
		advance(2000);
		expect(applied).toEqual(["foot", "ship"]);
	});

	test("passage rapide par un siège (< 2 s) : rien ne bouge", () => {
		const a = make();
		a.update("on_foot");
		advance(2000);
		a.update("seated");
		advance(800);
		a.update("on_foot");
		advance(5000);
		expect(applied).toEqual(["foot"]);
	});

	test("même position répétée (frames) : une seule bascule ; position inconnue ignorée", () => {
		const a = make();
		for (let i = 0; i < 10; i++) {
			a.update("seated");
			advance(300);
		}
		a.update("unknown");
		advance(5000);
		expect(applied).toEqual(["ship"]);
	});

	test("désactivé : jamais de bascule", () => {
		settings.enabled = false;
		const a = make();
		a.update("seated");
		advance(5000);
		expect(applied).toEqual([]);
	});

	test("position sans vue choisie, ou vue supprimée : ne change pas", () => {
		settings.eva = "";
		views = ["foot"];
		const a = make();
		a.update("eva");
		advance(3000);
		a.update("seated");
		advance(3000);
		expect(applied).toEqual([]);
	});

	test("pendant l'édition : attend, puis bascule au verrouillage", () => {
		editing = true;
		const a = make();
		a.update("seated");
		advance(10_000);
		expect(applied).toEqual([]);
		editing = false;
		a.retry();
		expect(applied).toEqual(["ship"]);
	});

	test("choix manuel respecté jusqu'au prochain vrai changement de position", () => {
		const a = make();
		a.update("seated");
		advance(2000);
		expect(applied).toEqual(["ship"]);
		// L'utilisateur change d'onglet à la main ; les frames suivantes (toujours assis) ne le ramènent pas.
		for (let i = 0; i < 5; i++) {
			a.update("seated");
			advance(1000);
		}
		expect(applied).toEqual(["ship"]);
		a.update("on_foot");
		advance(2000);
		expect(applied).toEqual(["ship", "foot"]);
	});

	test("page ouverte par un lien ?view= : la position de départ ne déclenche rien", () => {
		const a = make(true);
		a.update("seated");
		advance(5000);
		expect(applied).toEqual([]);
		a.update("on_foot");
		advance(2000);
		expect(applied).toEqual(["foot"]);
	});

	test("activation pendant qu'on est assis : bascule tout de suite vers la vue « assis » (même après un choix manuel)", () => {
		settings.enabled = false;
		const a = make();
		a.update("seated");
		advance(5000);
		settings.enabled = true;
		a.settingsChanged();
		expect(applied).toEqual(["ship"]);
	});

	test("réglages lus avec tolérance", () => {
		// Par défaut : à pied → onglet Personnage, assis → onglet Vaisseau, EVA → ne pas changer.
		const defaults = { enabled: false, on_foot: "character", seated: "ship", eva: "" };
		expect(parseAutoSettings(null)).toEqual(defaults);
		expect(parseAutoSettings("{pas du json")).toEqual(defaults);
		// Position absente → défaut ; « » enregistré = « ne pas changer » choisi exprès ; valeur invalide → défaut.
		expect(parseAutoSettings(JSON.stringify({ enabled: true, seated: "view:v1", on_foot: "", eva: 3 }))).toEqual({ enabled: true, on_foot: "", seated: "view:v1", eva: "" });
		expect(parseAutoSettings(JSON.stringify({ enabled: true }))).toEqual({ ...defaults, enabled: true });
	});

	test("onglet changé à la main pendant les 2 s d'attente : respecté", () => {
		const a = make();
		a.update("seated");
		advance(1000);
		a.userNavigated();
		advance(5000);
		expect(applied).toEqual([]);
		a.update("on_foot");
		advance(2000);
		expect(applied).toEqual(["foot"]);
	});

	test("onglet changé à la main pendant une édition en attente : respecté au verrouillage", () => {
		editing = true;
		const a = make();
		a.update("seated");
		advance(3000);
		a.userNavigated();
		editing = false;
		a.retry();
		advance(5000);
		expect(applied).toEqual([]);
	});

	test("réglage d'une autre position : la vue affichée ne bouge pas", () => {
		const a = make();
		a.update("seated");
		advance(2000);
		a.userNavigated();
		settings = { ...settings, on_foot: "space" };
		a.settingsChanged();
		expect(applied).toEqual(["ship"]);
	});

	test("vue de la position actuelle changée dans la fenêtre : appliquée tout de suite", () => {
		const a = make();
		a.update("seated");
		advance(2000);
		settings = { ...settings, seated: "space" };
		a.settingsChanged();
		expect(applied).toEqual(["ship", "space"]);
	});
});
