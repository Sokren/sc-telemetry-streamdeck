import { describe, expect, test } from "vitest";
import { readWeapons } from "../../src/display/weapons.js";

const SEATED = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const ON_FOOT = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } };
const gun = (ready: boolean, name = "KLWE_LaserRepeater_S1_877602860581") => ({
	name,
	is_powered: true,
	...(ready ? { ready_to_fire: true } : {}),
	contained_in_preset: true,
});

describe("readWeapons", () => {
	test("capture du Prospector : 2 / 2 prêtes, groupe 1, cardans fixes", () => {
		const w = { settings: { gimbals_locked: true }, weapons: [gun(true), gun(true)] };
		expect(readWeapons({ weapons: w, actor: SEATED })).toEqual({
			available: true,
			ready: 2,
			total: 2,
			percent: 100,
			level: "ok",
			group: { index: 0 },
			gimbalsLocked: true,
		});
	});

	test("après déverrouillage (champs absents en proto3) : 0 / 2, rouge, cardans libres", () => {
		const r = readWeapons({ weapons: { weapons: [gun(false), gun(false)] }, actor: SEATED });
		expect(r).toMatchObject({ ready: 0, total: 2, percent: 0, level: "bad", gimbalsLocked: false });
	});

	test("une partie prête → orange", () => {
		expect(readWeapons({ weapons: { weapons: [gun(true), gun(false)] }, actor: SEATED })).toMatchObject({ ready: 1, total: 2, percent: 50, level: "warn" });
	});

	test("groupe : nom s'il existe, sinon index", () => {
		expect(readWeapons({ weapons: { preset_index: 2, preset_name: "Missiles", weapons: [gun(true)] }, actor: SEATED })).toMatchObject({
			group: { index: 2, name: "Missiles" },
		});
		expect(readWeapons({ weapons: { preset_index: 1, preset_name: "  ", weapons: [gun(true)] } })).toMatchObject({ group: { index: 1 } });
	});

	test("vaisseau sans arme : disponible, total 0 (affiché « — » par l'appelant)", () => {
		expect(readWeapons({ weapons: { settings: { gimbals_locked: true } }, actor: SEATED })).toMatchObject({ available: true, ready: 0, total: 0 });
	});

	test("section absente ou perso à pied → indisponible ; actor absente → considéré assis", () => {
		expect(readWeapons({ actor: SEATED })).toEqual({ available: false });
		expect(readWeapons({ weapons: { weapons: [gun(true)] }, actor: ON_FOOT })).toEqual({ available: false });
		expect(readWeapons({ weapons: { weapons: [gun(true)] } })).toMatchObject({ available: true, ready: 1 });
	});

	test("entrées invalides ignorées", () => {
		expect(readWeapons({ weapons: { weapons: [null, 3, gun(true)], preset_index: -1 } })).toMatchObject({ ready: 1, total: 1, group: { index: 0 } });
	});
});
