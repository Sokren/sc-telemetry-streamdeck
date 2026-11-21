import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { CountermeasureTracker } from "../../src/display/countermeasures.js";
import { characterOf, shipStatusOf } from "../../src/web/panels.js";
import en from "../../src/web/labels.en.json" with { type: "json" };
import fr from "../../src/web/labels.fr.json" with { type: "json" };

type Obj = Record<string, unknown>;
const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8")) as { vehicle: Obj; actor: Obj };
const withVehicle = (patch: (s: Obj) => void): Obj => {
	const v = structuredClone(titan.vehicle) as { state: Obj };
	patch(v.state);
	return v;
};

describe("libellés de l'appli web", () => {
	test("mêmes clés en français et en anglais, aucune vide", () => {
		const keys = (o: object, p = ""): string[] =>
			Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
		expect(keys(fr).sort()).toEqual(keys(en).sort());
		for (const t of [fr, en]) for (const k of keys(t)) expect(k.split(".").reduce((o: any, x) => o[x], t), k).not.toBe("");
	});
});

describe("characterOf", () => {
	test("perso assis pilote : position, rôle, siège, 13 constantes", () => {
		const c = characterOf(titan.actor, "fr");
		expect(c).toMatchObject({
			available: true,
			locomotion: "seated",
			locomotionLabel: "Assis",
			crewRole: "pilot",
			crewRoleLabel: "Pilote",
			seat: "AEGS_Avenger_SCItem_Seat_Pilot_877343717572",
		});
		expect(c.vitals).toHaveLength(13);
		expect(characterOf(titan.actor, "en")).toMatchObject({ locomotionLabel: "Seated", crewRoleLabel: "Pilot" });
	});

	test("pas de données → indisponible, « — »", () => {
		const c = characterOf(undefined, "fr");
		expect(c).toMatchObject({ available: false, locomotion: "unknown", locomotionLabel: "—", crewRole: "none", seat: null });
		expect(c.vitals.every((v) => !v.available)).toBe(true);
	});

	test("à pied, sans rôle ni siège", () => {
		const c = characterOf({ state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } }, "fr");
		expect(c).toMatchObject({ locomotion: "on_foot", locomotionLabel: "À pied", crewRole: "none", crewRoleLabel: "—", seat: null });
	});
});

describe("shipStatusOf", () => {
	test("Titan : nom, posé, mode, instruments", () => {
		const s = shipStatusOf(titan.vehicle, titan.actor, "fr");
		expect(s).toMatchObject({ available: true, name: "Avenger Titan", landed: true, masterMode: "scm", masterModeLabel: "SCM" });
		const by = Object.fromEntries(s.instruments.map((i) => [i.id, i]));
		expect(by.shields).toMatchObject({ label: "Boucliers", text: "100", unit: "%", percent: 100, level: "ok" });
		expect(by.hull).toMatchObject({ label: "Coque", text: "100", unit: "%", level: "ok" });
		expect(by.hydrogen).toMatchObject({ text: "100", unit: "%", level: "ok" });
		expect(by.speed).toMatchObject({ text: "0", unit: "m/s", level: "none" });
		expect(by.radar_altitude).toMatchObject({ text: "4", unit: "m" });
		expect(by.heading).toMatchObject({ text: "0", unit: "°" });
		expect(s.instruments.map((i) => i.id)).toEqual(["shields", "hull", "decoys", "noise", "weapons_ready", "weapon_group", "gimbals", "hydrogen", "quantum", "speed", "radar_altitude", "heading"]);
	});

	test("voyants : 10, état et clignotement", () => {
		const s = shipStatusOf(titan.vehicle, titan.actor, "en");
		expect(s.annunciators.map((a) => a.id)).toEqual(["pwr", "wpn", "thr", "shld", "cool", "qdrv", "radr", "prox", "hit", "misl"]);
		const by = Object.fromEntries(s.annunciators.map((a) => [a.id, a]));
		expect(by.pwr).toMatchObject({ label: "Power", state: "nominal", flashing: false });
		expect(by.wpn).toMatchObject({ state: "minor", flashing: false });
		expect(by.cool).toMatchObject({ state: "off" });
		const flashing = shipStatusOf(withVehicle((st) => ((st.annunciators as Obj).hit = "ANNUNCIATOR_STATE_MAJOR_FLASHING")), titan.actor, "en");
		expect(flashing.annunciators.find((a) => a.id === "hit")).toMatchObject({ state: "major", flashing: true });
	});

	test("niveaux des jauges : 40 % orange, 10 % rouge", () => {
		const s = shipStatusOf(withVehicle((st) => ((st.shields = { level: 0.4 }), (st.health = 0.1))), titan.actor, "fr");
		const by = Object.fromEntries(s.instruments.map((i) => [i.id, i]));
		expect(by.shields.level).toBe("warn");
		expect(by.hull.level).toBe("bad");
	});

	test("hors du vaisseau (à pied) ou sans données → indisponible, « — »", () => {
		for (const s of [
			shipStatusOf(undefined, titan.actor, "fr"),
			shipStatusOf(titan.vehicle, { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } }, "fr"),
		]) {
			expect(s).toMatchObject({ available: false, name: null, landed: null, masterMode: null, masterModeLabel: "—" });
			expect(s.instruments.every((i) => i.text === "—" && i.level === "none")).toBe(true);
			expect(s.annunciators.every((a) => a.state === "unknown")).toBe(true);
		}
	});

	test("boucliers absents (champ optional) → « — » ; altitude invalide ignorée", () => {
		const s = shipStatusOf(withVehicle((st) => delete st.shields), titan.actor, "fr");
		expect(s.instruments.find((i) => i.id === "shields")).toMatchObject({ text: "—", level: "none" });
		expect(s.instruments.some((i) => i.id === ("altitude" as never))).toBe(false);
	});

	test("contre-mesures (capture du Prospector) : nombre, pourcentage du plus grand stock vu, couleur", () => {
		const tracker = new CountermeasureTracker();
		const weapons = (d: number, n: number) => ({
			countermeasures: [
				{ type: "COUNTERMEASURE_TYPE_DECOY", amount: d },
				{ type: "COUNTERMEASURE_TYPE_NOISE", amount: n },
			],
		});
		shipStatusOf(titan.vehicle, titan.actor, "fr", { weapons: weapons(48, 5), tracker });
		const s = shipStatusOf(titan.vehicle, titan.actor, "fr", { weapons: weapons(45, 1), tracker });
		const by = Object.fromEntries(s.instruments.map((i) => [i.id, i]));
		expect(by.decoys).toMatchObject({ label: "Leurres", text: "45", unit: "", level: "ok" });
		expect(by.decoys.percent).toBeCloseTo(93.75);
		expect(by.noise).toMatchObject({ label: "Brouilleurs", text: "1", unit: "", percent: 20, level: "bad" });
		expect(shipStatusOf(titan.vehicle, titan.actor, "en", { weapons: weapons(45, 1), tracker }).instruments.find((i) => i.id === "noise")?.label).toBe("Noise");
	});

	test("contre-mesures sans section weapons, ou type absent → « — »", () => {
		const tracker = new CountermeasureTracker();
		for (const cm of [undefined, { tracker }, { weapons: { countermeasures: [] }, tracker }]) {
			const s = shipStatusOf(titan.vehicle, titan.actor, "fr", cm);
			for (const id of ["decoys", "noise"]) expect(s.instruments.find((i) => i.id === id)).toMatchObject({ text: "—", level: "none" });
		}
	});

	test("contre-mesures : même règle que la touche quand la section vehicle est en retard", () => {
		const tracker = new CountermeasureTracker();
		const weapons = { countermeasures: [{ type: "COUNTERMEASURE_TYPE_DECOY", amount: 45 }] };
		const s = shipStatusOf(undefined, titan.actor, "fr", { weapons, tracker });
		expect(s.available).toBe(false);
		expect(s.instruments.find((i) => i.id === "decoys")).toMatchObject({ text: "45" });
		const onFoot = shipStatusOf(undefined, { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } }, "fr", { weapons, tracker });
		expect(onFoot.instruments.find((i) => i.id === "decoys")).toMatchObject({ text: "—" });
	});

	test("armes (Prospector) : prêtes / total, groupe, cardans ; « — » sans section weapons", () => {
		const tracker = new CountermeasureTracker();
		const gun = (ready: boolean) => ({ name: "KLWE_LaserRepeater_S1_1", is_powered: true, ...(ready ? { ready_to_fire: true } : {}) });
		const s = shipStatusOf(titan.vehicle, titan.actor, "fr", {
			weapons: { settings: { gimbals_locked: true }, weapons: [gun(true), gun(false)] },
			tracker,
		});
		const by = Object.fromEntries(s.instruments.map((i) => [i.id, i]));
		expect(by.weapons_ready).toMatchObject({ label: "Armes prêtes", text: "1 / 2", unit: "", percent: 50, level: "warn" });
		expect(by.weapon_group).toMatchObject({ label: "Groupe d'armes", text: "Toutes", level: "none" });
		expect(by.gimbals).toMatchObject({ label: "Cardans", text: "Fixes", level: "none" });
		const en = shipStatusOf(titan.vehicle, titan.actor, "en", { weapons: { preset_name: "Missiles", weapons: [gun(true)] }, tracker });
		expect(en.instruments.find((i) => i.id === "weapon_group")).toMatchObject({ label: "Weapon group", text: "Missiles" });
		expect(en.instruments.find((i) => i.id === "gimbals")).toMatchObject({ text: "Free" });
		const none = shipStatusOf(titan.vehicle, titan.actor, "fr", { tracker });
		for (const id of ["weapons_ready", "weapon_group", "gimbals"]) expect(none.instruments.find((i) => i.id === id)).toMatchObject({ text: "—" });
	});
});
