import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { DANGEROUS_ACTIONS } from "../../src/game/dangerous.js";
import { SHIP_FUNCTIONS, shipFunction, type ShipFunctionId } from "../../src/ship/functions.js";
import { readShipState } from "../../src/ship/state.js";

type Obj = Record<string, unknown>;
/** Frame réelle : Avenger Titan, siège pilote, posé, train sorti (2026-11-21). */
const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8")) as { vehicle: Obj; actor: Obj };
const actions = (JSON.parse(fs.readFileSync(new URL("../../schema/actions.json", import.meta.url), "utf-8")) as { actions: { action_name: string }[] }).actions.map((a) => a.action_name);

/** Copie du vaisseau avec `vehicle.state` modifié. */
function withState(patch: (s: Obj) => void): Obj {
	const v = structuredClone(titan.vehicle) as { state: Obj };
	patch(v.state);
	return v;
}
const flight = (s: Obj) => s.flight as { state: Obj; settings: Obj };
/** `null` = section absente ou périmée. */
const read = (id: ShipFunctionId, vehicle: Obj | null = titan.vehicle, actor: Obj | null = titan.actor) =>
	readShipState(id, vehicle ?? undefined, actor ?? undefined);

describe("table des fonctions", () => {
	test("17 fonctions dans l'ordre de la spec", () => {
		expect(SHIP_FUNCTIONS.map((f) => f.id)).toEqual([
			"gear", "lights", "vtol", "transform", "decoupled", "gsafe", "proximity", "esp", "advanced_hud",
			"night_vision", "master_nav", "power_engines", "power_weapons", "power_shields", "power_main", "doors_closed", "doors_locked",
		]);
	});

	test("chaque commande existe dans le jeu et n'est pas dangereuse", () => {
		for (const f of SHIP_FUNCTIONS) {
			for (const name of [f.on, f.off, f.toggle].filter((n): n is string => !!n)) {
				expect(actions, `${f.id} : ${name}`).toContain(name);
				expect(DANGEROUS_ACTIONS.has(name), `${f.id} : ${name}`).toBe(false);
			}
		}
	});

	test("fonctions « On seulement » : puissance générale et portes, sans commande off ni bascule", () => {
		const onlyOn = SHIP_FUNCTIONS.filter((f) => f.onlyOn).map((f) => f.id);
		expect(onlyOn).toEqual(["power_main", "doors_closed", "doors_locked"]);
		for (const f of SHIP_FUNCTIONS.filter((f) => f.onlyOn)) {
			expect(f.off).toBeUndefined();
			expect(f.toggle).toBeUndefined();
		}
	});

	test("ESP : bascule seulement", () => {
		expect(shipFunction("esp")).toMatchObject({ on: undefined, off: undefined, toggle: "v_ifcs_toggle_esp" });
	});

	test("id inconnu → train", () => {
		expect(shipFunction("v_self_destruct").id).toBe("gear");
		expect(shipFunction(undefined).id).toBe("gear");
	});

	test("liste des actions dangereuses complétée (11 noms)", () => {
		expect([...DANGEROUS_ACTIONS].sort()).toEqual(
			[
				"v_self_destruct", "v_eject", "v_emergency_exit", "v_power_set_off", "v_power_toggle", "v_open_all_doors",
				"v_toggle_all_doors", "v_unlock_all_doors", "v_unlock_all_ports", "v_toggle_all_doorlocks", "v_toggle_all_portlocks",
			].sort(),
		);
	});
});

describe("état sur la frame réelle du Titan", () => {
	test.each<[ShipFunctionId, string]>([
		["gear", "on"],
		["vtol", "on"],
		["transform", "unavailable"],
		["lights", "off"],
		["decoupled", "off"],
		["gsafe", "on"],
		["proximity", "off"],
		["esp", "on"],
		["night_vision", "off"],
		["master_nav", "off"],
		["advanced_hud", "off"],
		["power_engines", "on"],
		["power_weapons", "on"],
		["power_shields", "on"],
		["power_main", "on"],
		["doors_closed", "unavailable"],
		["doors_locked", "unavailable"],
	])("%s → %s", (id, expected) => {
		expect(read(id)).toBe(expected);
	});
});

describe("absence et garde « assis »", () => {
	test("section vehicle absente ou périmée → unknown", () => {
		expect(read("gear", null)).toBe("unknown");
	});

	test("perso à pied (actor frais) → unknown même si vehicle est encore là", () => {
		const onFoot = { ...titan.actor, state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } };
		expect(read("gear", titan.vehicle, onFoot)).toBe("unknown");
		expect(read("gear", titan.vehicle, { state: {} })).toBe("unknown"); // locomotion non transmise (UNSPECIFIED)
	});

	test("actor absent → on se fie à vehicle", () => {
		expect(read("gear", titan.vehicle, null)).toBe("on");
	});
});

describe("déploiement", () => {
	const gear = (value: string | undefined) =>
		read("gear", withState((s) => (value === undefined ? delete flight(s).state.gear : (flight(s).state.gear = value))));

	test("en mouvement et valeurs inconnues", () => {
		expect(gear("VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYING")).toBe("moving-on");
		expect(gear("VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTING")).toBe("moving-off");
		expect(gear("VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTED")).toBe("off");
		expect(gear("VEHICLE_COMPONENT_DEPLOYMENT_STATE_UNSPECIFIED")).toBe("unknown");
		expect(gear("FUTUR")).toBe("unknown");
		expect(gear(undefined)).toBe("unavailable");
	});

	test("section flight absente → train indisponible", () => {
		expect(read("gear", withState((s) => delete s.flight))).toBe("unavailable");
	});
});

describe("réglages de vol (Availability)", () => {
	test("{} ou enabled faux → indisponible ; enabled sans active → off", () => {
		expect(read("gsafe", withState((s) => (flight(s).settings.ifcs_g_safe = {})))).toBe("unavailable");
		expect(read("gsafe", withState((s) => (flight(s).settings.ifcs_g_safe = { enabled: true })))).toBe("off");
		expect(read("gsafe", withState((s) => delete flight(s).settings.ifcs_g_safe))).toBe("unavailable");
	});

	test("découplage = inverse de couplé", () => {
		expect(read("decoupled", withState((s) => (flight(s).settings.ifcs_coupled = { enabled: true })))).toBe("on");
		expect(read("decoupled", withState((s) => (flight(s).settings.ifcs_coupled = {})))).toBe("unavailable");
	});

	test("phares et vision nocturne allumés", () => {
		expect(read("lights", withState((s) => (s.lights_enabled = true)))).toBe("on");
		expect(read("night_vision", withState((s) => (flight(s).settings.flight_light_amplification = true)))).toBe("on");
	});
});

describe("mode maître et HUD avancé", () => {
	const nav = (s: Obj) => (s.master_mode = { mode: "VEHICLE_MASTER_MODE_NAVIGATION" });

	test("NAV → on ; HUD lu sur l'indicateur NAV", () => {
		expect(read("master_nav", withState(nav))).toBe("on");
		expect(read("advanced_hud", withState((s) => (nav(s), (flight(s).settings.advanced_hud_enabled_nav = true))))).toBe("on");
		expect(read("advanced_hud", withState((s) => (nav(s), (flight(s).settings.advanced_hud_enabled_scm = true))))).toBe("off");
	});

	test("SCM → HUD lu sur l'indicateur SCM", () => {
		expect(read("advanced_hud", withState((s) => (flight(s).settings.advanced_hud_enabled_scm = true)))).toBe("on");
	});

	test("mode non transmis ou inconnu → unknown ; master_mode absent → unavailable", () => {
		expect(read("master_nav", withState((s) => (s.master_mode = {})))).toBe("unknown");
		expect(read("advanced_hud", withState((s) => (s.master_mode = {})))).toBe("unknown");
		expect(read("master_nav", withState((s) => (s.master_mode = { mode: "VEHICLE_MASTER_MODE_STEALTH" })))).toBe("unknown");
		expect(read("master_nav", withState((s) => delete s.master_mode))).toBe("unavailable");
	});
});

describe("puissance et portes", () => {
	test("puissance absente → indisponible ; champ absent → off", () => {
		expect(read("power_engines", withState((s) => delete s.power))).toBe("unavailable");
		expect(read("power_weapons", withState((s) => (s.power = { engines: true })))).toBe("off");
	});

	test("portes", () => {
		const doors = (open: string | undefined, lock: string | undefined) =>
			withState((s) => (s.doors = { ...(open && { open_state: open }), ...(lock && { lock_state: lock }) }));
		expect(read("doors_closed", doors("DOOR_OPEN_STATE_CLOSED", undefined))).toBe("on");
		expect(read("doors_closed", doors("DOOR_OPEN_STATE_OPENED", undefined))).toBe("off");
		expect(read("doors_locked", doors(undefined, "DOOR_LOCK_STATE_LOCKED"))).toBe("on");
		expect(read("doors_locked", doors(undefined, "DOOR_LOCK_STATE_UNLOCKED"))).toBe("off");
		expect(read("doors_locked", doors(undefined, undefined))).toBe("unknown"); // UNSPECIFIED non transmis
	});
});
