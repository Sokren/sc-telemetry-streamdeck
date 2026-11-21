import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultLayout, MAX_VIEWS, parseViewInput, ViewStore } from "../../src/web/view.js";

const input = (): any => ({ name: "Vue", sections: JSON.parse(JSON.stringify(defaultLayout("fr").sections)) });
const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "sc-view-"));
	dirs.push(d);
	return d;
};
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("parseViewInput", () => {
	test("la disposition par défaut est valide et inchangée", () => {
		expect(parseViewInput(input(), "fr")).toEqual({ name: "Vue", sections: defaultLayout("fr").sections });
		expect(defaultLayout("fr").sections.map((s) => s.title)).toEqual(["Survie", "Vol", "Commandes du vaisseau"]);
		expect(defaultLayout("en").sections.map((s) => s.title)).toEqual(["Survival", "Flight", "Ship controls"]);
	});

	test.each([
		["type de case inconnu", (v: any) => (v.sections[0].items[0].kind = "rocket")],
		["constante inconnue", (v: any) => (v.sections[0].items[0] = { id: "x", kind: "vital", ref: "mana", size: 1 })],
		["action dangereuse", (v: any) => v.sections[0].items.push({ id: "x", kind: "action", ref: "v_self_destruct", size: 1 })],
		["nom d'action invalide", (v: any) => v.sections[0].items.push({ id: "x", kind: "action", ref: "../x", size: 1 })],
		["taille 3", (v: any) => (v.sections[0].items[0].size = 3)],
		["largeur inconnue", (v: any) => (v.sections[0].width = "third")],
		["ids de section en double", (v: any) => (v.sections[1].id = v.sections[0].id)],
		["ids de case en double", (v: any) => (v.sections[1].items[0].id = v.sections[0].items[0].id)],
		["id invalide", (v: any) => (v.sections[0].id = "a b")],
		["21 sections", (v: any) => (v.sections = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: "x", width: "half", items: [] })))],
		["41 cases", (v: any) => (v.sections[0].items = Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, kind: "annunciators", size: 1 })))],
		["sections pas un tableau", (v: any) => (v.sections = "x")],
		["nom pas un texte", (v: any) => (v.name = 3)],
	])("refus : %s", (_name, mutate) => {
		const v = input();
		mutate(v);
		expect(parseViewInput(v, "fr")).toBeUndefined();
	});

	test("refus : pas un objet", () => {
		expect(parseViewInput(null, "fr")).toBeUndefined();
		expect(parseViewInput([], "fr")).toBeUndefined();
	});

	test("sections absentes → aucune (création) ; nom tronqué à 24, vide → Vue / View", () => {
		expect(parseViewInput({ name: "Vol" }, "fr")).toEqual({ name: "Vol", sections: [] });
		expect(parseViewInput({ name: "x".repeat(50) }, "fr")!.name).toHaveLength(24);
		expect(parseViewInput({ name: "   " }, "fr")!.name).toBe("Vue");
		expect(parseViewInput({}, "en")!.name).toBe("View");
	});

	test("titre de section tronqué à 40, vide → « Section »", () => {
		const v = input();
		v.sections[0].title = "x".repeat(200);
		v.sections[1].title = "   ";
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].title).toHaveLength(40);
		expect(p.sections[1].title).toBe("Section");
	});

	test("action normale acceptée, ref ignorée pour les voyants", () => {
		const v = input();
		v.sections[0].items.push({ id: "e1", kind: "action", ref: "emote_wave", size: 2 });
		v.sections[0].items.push({ id: "a1", kind: "annunciators", ref: "nimporte", size: 1 });
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].items.at(-2)).toEqual({ id: "e1", kind: "action", ref: "emote_wave", size: 2 });
		expect(p.sections[0].items.at(-1)).toEqual({ id: "a1", kind: "annunciators", size: 1 });
	});
});

describe("ViewStore", () => {
	test("premier lancement : une vue « main » dont le nom suit la langue", () => {
		const s = new ViewStore();
		expect(s.list("fr")).toEqual([{ id: "main", name: "Ma vue", sections: defaultLayout("fr").sections }]);
		expect(s.list("en")[0]).toMatchObject({ id: "main", name: "My view" });
		expect(s.list("en")[0].sections[0].title).toBe("Survival");
	});

	test("création jusqu'à 10 vues, ids uniques et valides", () => {
		const s = new ViewStore();
		const ids = new Set<string>(["main"]);
		for (let i = 1; i < MAX_VIEWS; i++) {
			const v = s.create({ name: `Vue ${i}`, sections: [] }, "fr");
			if (typeof v === "string") throw new Error(v);
			expect(v.id).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
			ids.add(v.id);
		}
		expect(ids.size).toBe(MAX_VIEWS);
		expect(s.create({ name: "Trop", sections: [] }, "fr")).toBe("too_many");
		expect(s.list("fr")).toHaveLength(MAX_VIEWS);
	});

	test("modification d'une vue sans toucher les autres", () => {
		const s = new ViewStore();
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		expect(s.update("main", { name: "A", sections: [] }, "fr")).toMatchObject({ id: "main", name: "A", sections: [] });
		expect(s.update(b.id, { name: "B2", sections: input().sections }, "fr")).toMatchObject({ name: "B2" });
		expect(s.list("fr").map((v) => v.name)).toEqual(["A", "B2"]);
		expect(s.list("fr")[0].sections).toEqual([]);
		expect(s.update("nope", { name: "x", sections: [] }, "fr")).toBe("unknown");
	});

	test("suppression : inconnue, dernière vue refusée", () => {
		const s = new ViewStore();
		expect(s.remove("main", "fr")).toBe("last");
		expect(s.remove("nope", "fr")).toBe("unknown");
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		expect(s.remove("main", "fr")).toBe(true);
		expect(s.list("fr").map((v) => v.id)).toEqual([b.id]);
	});

	test("nom de « main » figé dans la langue de la page qui enregistre la première fois", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		s.create({ name: "X", sections: [] }, "fr");
		expect(s.list("en")[0].name).toBe("Ma vue");
		expect(s.list("en")[0].sections[0].title).toBe("Survie");
		expect(JSON.parse(fs.readFileSync(file, "utf-8")).version).toBe(2);
	});

	test("enregistre et relit le fichier", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		const b = s.create({ name: "Vol", sections: [] }, "fr") as any;
		s.update("main", { name: "Mes jauges", sections: [] }, "fr");
		expect(new ViewStore(file).list("en")).toEqual([
			{ id: "main", name: "Mes jauges", sections: [] },
			{ id: b.id, name: "Vol", sections: [] },
		]);
	});

	test("ancien format (une seule vue, version 1) : devient la vue « main »", () => {
		const file = path.join(tmp(), "view.json");
		const sections = input().sections;
		sections[0].title = "Mes jauges";
		fs.writeFileSync(file, JSON.stringify({ version: 1, sections }));
		const s = new ViewStore(file);
		expect(s.list("fr")).toEqual([{ id: "main", name: "Ma vue", sections }]);
		expect(s.list("en")[0].name).toBe("My view");
		s.create({ name: "B", sections: [] }, "en");
		expect(new ViewStore(file).list("fr")[0]).toEqual({ id: "main", name: "My view", sections });
	});

	test("fichier illisible : vue par défaut, ancien fichier gardé en .bak", () => {
		const file = path.join(tmp(), "view.json");
		fs.writeFileSync(file, "{ pas du json");
		expect(new ViewStore(file).list("fr")[0].sections).toEqual(defaultLayout("fr").sections);
		expect(fs.readFileSync(`${file}.bak`, "utf-8")).toBe("{ pas du json");
	});

	test("case devenue invalide (mise à jour de l'appli) : seule cette case est retirée, les vues restent, ancien fichier en .bak", () => {
		const file = path.join(tmp(), "view.json");
		const a = { id: "main", name: "A", sections: input().sections };
		const b = { id: "vb", name: "B", sections: input().sections.map((s: any) => ({ ...s, id: `b${s.id}`, items: s.items.map((i: any) => ({ ...i, id: `b${i.id}` })) })) };
		b.sections[0].items[0].ref = "constante_retiree";
		b.sections[1].items.push({ id: "boom", kind: "action", ref: "v_self_destruct", size: 1 });
		fs.writeFileSync(file, JSON.stringify({ version: 2, views: [a, b, { id: "a b", name: "id invalide", sections: [] }] }));
		const views = new ViewStore(file).list("fr");
		expect(views.map((v) => v.name)).toEqual(["A", "B"]);
		expect(views[0].sections).toEqual(a.sections);
		expect(views[1].sections[0].items).toHaveLength(a.sections[0].items.length - 1);
		expect(views[1].sections[1].items).toHaveLength(a.sections[1].items.length);
		expect(fs.existsSync(`${file}.bak`)).toBe(true);
	});

	test("ancien format avec une case devenue invalide : le reste est gardé", () => {
		const file = path.join(tmp(), "view.json");
		const sections = input().sections;
		sections[0].items[0].kind = "rocket";
		fs.writeFileSync(file, JSON.stringify({ version: 1, sections }));
		const s = new ViewStore(file).list("fr")[0];
		expect(s.sections).toHaveLength(3);
		expect(s.sections[0].items).toHaveLength(sections[0].items.length - 1);
	});

	test("fichier sans dérive : pas de .bak", () => {
		const file = path.join(tmp(), "view.json");
		new ViewStore(file).create({ name: "B", sections: input().sections }, "fr");
		new ViewStore(file);
		expect(fs.existsSync(`${file}.bak`)).toBe(false);
	});

	test("fichier version 2 sans aucune vue valide : .bak", () => {
		const file = path.join(tmp(), "view.json");
		fs.writeFileSync(file, JSON.stringify({ version: 2, views: [{ id: "a b", name: "A", sections: [] }, "x"] }));
		expect(new ViewStore(file).list("fr")[0].id).toBe("main");
		expect(fs.existsSync(`${file}.bak`)).toBe(true);
	});

	test("onChange prévenu à chaque création, modification et suppression", () => {
		const s = new ViewStore();
		let n = 0;
		const off = s.onChange(() => n++);
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		s.update(b.id, { name: "C", sections: [] }, "fr");
		s.remove(b.id, "fr");
		s.update("nope", { name: "x", sections: [] }, "fr");
		off();
		s.create({ name: "D", sections: [] }, "fr");
		expect(n).toBe(3);
	});
});
