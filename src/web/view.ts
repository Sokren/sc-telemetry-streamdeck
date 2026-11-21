import fs from "node:fs";
import type { Lang } from "../catalog/labels.js";
import { DISPLAY_VALUES } from "../display/values.js";
import { DANGEROUS_ACTIONS } from "../game/dangerous.js";
import { SHIP_FUNCTION_IDS } from "../ship/functions.js";
import { INSTRUMENTS } from "./panels.js";

/** « Ma vue » : vues nommées (un onglet chacune), faites de sections contenant des cases, enregistrées dans `view.json`. */
export const ITEM_KINDS = ["vital", "instrument", "annunciators", "ship_info", "character_info", "ship_function", "action"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type ViewItem = { id: string; kind: ItemKind; ref?: string; size: 1 | 2 };
export type ViewSection = { id: string; title: string; width: "half" | "full"; items: ViewItem[] };
export type Layout = { sections: ViewSection[] };
export type ViewInput = { name: string; sections: ViewSection[] };
export type NamedView = { id: string } & ViewInput;

export const MAX_VIEWS = 10;
export const MAX_SECTIONS = 20;
export const MAX_ITEMS = 40;
export const MAX_TITLE = 40;
export const MAX_NAME = 24;
export const MAIN_ID = "main";

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const ACTION = /^[a-z0-9_]{1,64}$/;

/** Valeurs permises de `ref` pour les types fermés (`annunciators` n'en a pas, `action` est vérifié à part). */
const REFS: Partial<Record<ItemKind, readonly string[]>> = {
	vital: DISPLAY_VALUES,
	instrument: INSTRUMENTS,
	ship_info: ["name", "master_mode", "landed"],
	character_info: ["position", "role", "seat"],
	ship_function: SHIP_FUNCTION_IDS,
};

const TITLES: Record<Lang, [string, string, string]> = {
	fr: ["Survie", "Vol", "Commandes du vaisseau"],
	en: ["Survival", "Flight", "Ship controls"],
};
const DEFAULT_NAME: Record<Lang, string> = { fr: "Ma vue", en: "My view" };
const EMPTY_NAME: Record<Lang, string> = { fr: "Vue", en: "View" };

/** Disposition de la vue du premier lancement, titres dans la langue de la page. */
export function defaultLayout(lang: Lang): Layout {
	const [survival, flight, controls] = TITLES[lang];
	return {
		sections: [
			{
				id: "survival",
				title: survival,
				width: "half",
				items: [
					{ id: "oxygen", kind: "vital", ref: "oxygen", size: 1 },
					{ id: "health", kind: "vital", ref: "health", size: 1 },
					{ id: "hunger", kind: "vital", ref: "hunger", size: 1 },
					{ id: "body_temperature", kind: "vital", ref: "body_temperature", size: 1 },
				],
			},
			{
				id: "flight",
				title: flight,
				width: "half",
				items: [
					{ id: "speed", kind: "instrument", ref: "speed", size: 2 },
					{ id: "hydrogen", kind: "instrument", ref: "hydrogen", size: 1 },
					{ id: "quantum", kind: "instrument", ref: "quantum", size: 1 },
				],
			},
			{
				id: "controls",
				title: controls,
				width: "full",
				items: [
					{ id: "gear", kind: "ship_function", ref: "gear", size: 1 },
					{ id: "lights", kind: "ship_function", ref: "lights", size: 1 },
					{ id: "annunciators", kind: "annunciators", size: 2 },
				],
			},
		],
	};
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);

function parseItem(x: unknown): ViewItem | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (!(ITEM_KINDS as readonly unknown[]).includes(o.kind)) return undefined;
	if (o.size !== 1 && o.size !== 2) return undefined;
	const kind = o.kind as ItemKind;
	if (kind === "annunciators") return { id: o.id, kind, size: o.size };
	if (typeof o.ref !== "string") return undefined;
	if (kind === "action") {
		if (!ACTION.test(o.ref) || DANGEROUS_ACTIONS.has(o.ref)) return undefined;
	} else if (!REFS[kind]?.includes(o.ref)) return undefined;
	return { id: o.id, kind, ref: o.ref, size: o.size };
}

function parseSection(x: unknown): ViewSection | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (o.width !== "half" && o.width !== "full") return undefined;
	if (!Array.isArray(o.items) || o.items.length > MAX_ITEMS) return undefined;
	const items = o.items.map(parseItem);
	if (items.some((i) => !i)) return undefined;
	const title = (typeof o.title === "string" ? o.title.trim() : "").slice(0, MAX_TITLE).trim() || "Section";
	return { id: o.id, title, width: o.width, items: items as ViewItem[] };
}

/** Sections validées (ids de sections et de cases uniques dans la vue), ou `undefined`. */
function parseSections(x: unknown): ViewSection[] | undefined {
	if (!Array.isArray(x) || x.length > MAX_SECTIONS) return undefined;
	const parsed = x.map(parseSection);
	if (parsed.some((s) => !s)) return undefined;
	const sections = parsed as ViewSection[];
	const sectionIds = sections.map((s) => s.id);
	const itemIds = sections.flatMap((s) => s.items.map((i) => i.id));
	if (new Set(sectionIds).size !== sectionIds.length || new Set(itemIds).size !== itemIds.length) return undefined;
	return sections;
}

/** Corps de création / modification d'une vue, normalisé (nom ≤ 24, vide → « Vue » / « View »), ou `undefined`. Sans `sections` : vue vide. */
export function parseViewInput(x: unknown, lang: Lang): ViewInput | undefined {
	const o = obj(x);
	if (!o || (o.name !== undefined && typeof o.name !== "string")) return undefined;
	const sections = o.sections === undefined ? [] : parseSections(o.sections);
	if (!sections) return undefined;
	const name = ((o.name as string | undefined) ?? "").trim().slice(0, MAX_NAME).trim() || EMPTY_NAME[lang];
	return { name, sections };
}

/**
 * Sections lues dans le fichier, avec tolérance : une case ou une section devenue invalide (constante retirée,
 * action passée dans les actions dangereuses après une mise à jour) est retirée, le reste est gardé.
 */
function looseSections(x: unknown): ViewSection[] {
	if (!Array.isArray(x)) return [];
	const sectionIds = new Set<string>();
	const itemIds = new Set<string>();
	const sections: ViewSection[] = [];
	for (const raw of x) {
		const o = obj(raw);
		if (!o || sections.length >= MAX_SECTIONS) continue;
		const items = (Array.isArray(o.items) ? o.items : [])
			.map(parseItem)
			.filter((i): i is ViewItem => !!i && !itemIds.has(i.id) && !!itemIds.add(i.id))
			.slice(0, MAX_ITEMS);
		const section = parseSection({ ...o, items });
		if (!section || sectionIds.has(section.id)) continue;
		sectionIds.add(section.id);
		sections.push(section);
	}
	return sections;
}

/**
 * Contenu d'un `view.json` : version 2 (liste de vues) ou version 1 (une seule vue sans nom → ses sections).
 * `lossy` : quelque chose a été retiré (l'ancien fichier est alors gardé en `.bak`). `undefined` : illisible.
 */
function parseFile(x: unknown): ({ views: NamedView[] } | { legacy: ViewSection[] }) & { lossy: boolean } | undefined {
	const o = obj(x);
	if (o?.version === 1 && Array.isArray(o.sections)) {
		const legacy = looseSections(o.sections);
		return { legacy, lossy: JSON.stringify(legacy) !== JSON.stringify(o.sections) };
	}
	if (o?.version !== 2 || !Array.isArray(o.views)) return undefined;
	const views: NamedView[] = [];
	for (const v of o.views) {
		const vo = obj(v);
		if (!vo || typeof vo.id !== "string" || !ID.test(vo.id) || typeof vo.name !== "string" || views.length >= MAX_VIEWS) continue;
		if (views.some((w) => w.id === vo.id)) continue;
		const name = vo.name.trim().slice(0, MAX_NAME).trim() || EMPTY_NAME.fr;
		views.push({ id: vo.id, name, sections: looseSections(vo.sections) });
	}
	if (!views.length) return undefined;
	return { views, lossy: JSON.stringify(views) !== JSON.stringify(o.views) };
}

/**
 * Vues enregistrées dans un fichier (ou en mémoire sans fichier). Tant que rien n'est écrit en version 2,
 * la vue `main` porte le nom par défaut dans la langue de la page ; la première écriture le fige.
 * Fichier illisible → `.bak` + vue par défaut.
 */
export class ViewStore {
	#views: NamedView[] | undefined;
	#legacy: ViewSection[] | undefined;
	readonly #listeners = new Set<() => void>();

	constructor(private readonly file?: string) {
		if (!file || !fs.existsSync(file)) return;
		const text = fs.readFileSync(file, "utf-8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = undefined;
		}
		const content = parseFile(parsed);
		if (!content || content.lossy) fs.writeFileSync(`${file}.bak`, text);
		if (!content) return;
		if ("views" in content) this.#views = content.views;
		else this.#legacy = content.legacy;
	}

	/** Vues dans l'ordre de création. */
	list(lang: Lang): NamedView[] {
		return this.#views ?? [this.#initial(lang)];
	}

	create(input: ViewInput, lang: Lang): NamedView | "too_many" {
		const views = this.#materialize(lang);
		if (views.length >= MAX_VIEWS) return "too_many";
		const view = { id: this.#newId(views), ...input };
		views.push(view);
		this.#save();
		return view;
	}

	update(id: string, input: ViewInput, lang: Lang): NamedView | "unknown" {
		if (!this.list(lang).some((v) => v.id === id)) return "unknown";
		const views = this.#materialize(lang);
		const view = { id, ...input };
		views[views.findIndex((v) => v.id === id)] = view;
		this.#save();
		return view;
	}

	remove(id: string, lang: Lang): true | "unknown" | "last" {
		const current = this.list(lang);
		if (!current.some((v) => v.id === id)) return "unknown";
		if (current.length === 1) return "last";
		const views = this.#materialize(lang);
		views.splice(views.findIndex((v) => v.id === id), 1);
		this.#save();
		return true;
	}

	onChange(fn: () => void): () => void {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	#initial(lang: Lang): NamedView {
		return { id: MAIN_ID, name: DEFAULT_NAME[lang], sections: this.#legacy ?? defaultLayout(lang).sections };
	}

	/** Fige la liste (nom et titres par défaut dans la langue de cette requête) avant une écriture. */
	#materialize(lang: Lang): NamedView[] {
		this.#views ??= [this.#initial(lang)];
		this.#legacy = undefined;
		return this.#views;
	}

	#newId(views: NamedView[]): string {
		const taken = new Set(views.map((v) => v.id));
		for (;;) {
			const id = `v${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
			if (!taken.has(id)) return id;
		}
	}

	#save(): void {
		if (this.file) fs.writeFileSync(this.file, `${JSON.stringify({ version: 2, views: this.#views }, null, "\t")}\n`);
		for (const fn of this.#listeners) fn();
	}
}
