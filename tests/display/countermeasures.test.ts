import { describe, expect, test } from "vitest";
import { CountermeasureTracker, type ShipSections } from "../../src/display/countermeasures.js";

type Obj = Record<string, unknown>;
const SEATED = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const ON_FOOT = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } };
const ship = (cls = "MISC_Prospector") => ({ state: { name: `${cls}_1`, class_name: cls } });
const weapons = (decoy?: number, noise?: number): Obj => ({
	countermeasures: [
		...(decoy === undefined ? [] : [decoy === 0 ? { type: "COUNTERMEASURE_TYPE_DECOY" } : { type: "COUNTERMEASURE_TYPE_DECOY", amount: decoy }]),
		...(noise === undefined ? [] : [noise === 0 ? { type: "COUNTERMEASURE_TYPE_NOISE" } : { type: "COUNTERMEASURE_TYPE_NOISE", amount: noise }]),
	],
});
const at = (w: Obj | undefined, opts: { vehicle?: Obj | null; actor?: Obj | null } = {}): ShipSections => ({
	weapons: w,
	vehicle: opts.vehicle === null ? undefined : (opts.vehicle ?? ship()),
	actor: opts.actor === null ? undefined : (opts.actor ?? SEATED),
});

describe("CountermeasureTracker", () => {
	test("stock plein (capture du Prospector : 48 / 5) → 100 %, vert", () => {
		const t = new CountermeasureTracker();
		expect(t.read("decoy", at(weapons(48, 5)))).toEqual({ available: true, amount: 48, percent: 100, level: "ok" });
		expect(t.read("noise", at(weapons(48, 5)))).toEqual({ available: true, amount: 5, percent: 100, level: "ok" });
	});

	test("après des lancers (45 / 3) : pourcentage du stock plein vu avant", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(48, 5)));
		const d = t.read("decoy", at(weapons(45, 3)));
		const n = t.read("noise", at(weapons(45, 3)));
		expect(d).toMatchObject({ amount: 45, level: "ok" });
		expect((d as { percent: number }).percent).toBeCloseTo(93.75);
		expect(n).toMatchObject({ amount: 3, percent: 60, level: "ok" });
		expect(t.read("noise", at(weapons(45, 2)))).toMatchObject({ percent: 40, level: "warn" });
		expect(t.read("noise", at(weapons(45, 1)))).toMatchObject({ percent: 20, level: "bad" });
	});

	test("0 (champ absent en proto3) → 0 %, rouge ; maximum à 0 → 0 %, sans division par zéro", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(48, 5)));
		expect(t.read("noise", at(weapons(45, 0)))).toEqual({ available: true, amount: 0, percent: 0, level: "bad" });
		const fresh = new CountermeasureTracker();
		expect(fresh.read("decoy", at(weapons(0, 0)))).toEqual({ available: true, amount: 0, percent: 0, level: "bad" });
	});

	test("type absent (vaisseau sans brouilleurs) → indisponible pour ce type seulement", () => {
		const t = new CountermeasureTracker();
		expect(t.read("noise", at(weapons(24)))).toEqual({ available: false });
		expect(t.read("decoy", at(weapons(24)))).toMatchObject({ available: true, amount: 24 });
	});

	test("section weapons absente ou périmée → indisponible", () => {
		const t = new CountermeasureTracker();
		expect(t.read("decoy", at(undefined))).toEqual({ available: false });
	});

	test("perso à pied → indisponible ; section actor absente → considéré assis", () => {
		const t = new CountermeasureTracker();
		expect(t.read("decoy", at(weapons(48, 5), { actor: ON_FOOT }))).toEqual({ available: false });
		expect(t.read("decoy", at(weapons(48, 5), { actor: null }))).toMatchObject({ available: true, amount: 48 });
	});

	test("même modèle revu après un combat : maximum gardé ; autre modèle : son propre maximum", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(48, 5)));
		t.observe(at(weapons(48, 5), { actor: ON_FOOT }));
		expect(t.read("noise", at(weapons(45, 3)))).toMatchObject({ percent: 60 });
		expect(t.read("noise", at(weapons(10, 4), { vehicle: ship("AEGS_Gladius") }))).toMatchObject({ percent: 100 });
		expect(t.read("noise", at(weapons(45, 3)))).toMatchObject({ percent: 60 });
	});

	test("section vehicle absente : dernier modèle connu", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(48, 5)));
		expect(t.read("noise", at(weapons(45, 3), { vehicle: null }))).toMatchObject({ percent: 60 });
	});

	test("stock plus grand que le maximum vu : le maximum monte", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(40, 5)));
		expect(t.read("decoy", at(weapons(48, 5)))).toMatchObject({ percent: 100 });
		expect(t.read("decoy", at(weapons(24, 5)))).toMatchObject({ percent: 50, level: "ok" });
	});

	test("type inconnu dans la liste : ignoré", () => {
		const t = new CountermeasureTracker();
		const w = { countermeasures: [{ type: "COUNTERMEASURE_TYPE_FUTUR", amount: 9 }, { type: "COUNTERMEASURE_TYPE_DECOY", amount: 3 }] };
		expect(t.read("decoy", at(w))).toMatchObject({ amount: 3 });
		expect(t.read("noise", at(w))).toEqual({ available: false });
	});

	test("changement de vaisseau avec section vehicle en retard : le stock du nouveau n'est pas compté pour l'ancien", () => {
		const t = new CountermeasureTracker();
		t.observe(at(weapons(48, 5)));
		// Premières frames du Gladius sans section vehicle : 96 leurres ne doivent pas devenir le maximum du Prospector.
		t.observe(at(weapons(96, 10), { vehicle: null }));
		expect(t.read("decoy", at(weapons(48, 5)))).toMatchObject({ percent: 100 });
	});

	test("aucun modèle encore connu : affiché (pourcentage du stock courant), rien n'est mémorisé", () => {
		const t = new CountermeasureTracker();
		expect(t.read("decoy", at(weapons(20, 5), { vehicle: null }))).toMatchObject({ available: true, amount: 20, percent: 100 });
		expect(t.read("decoy", at(weapons(40, 5)))).toMatchObject({ percent: 100 });
		expect(t.read("decoy", at(weapons(20, 5)))).toMatchObject({ percent: 50 });
	});
});
