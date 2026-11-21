import { DANGEROUS_ACTIONS } from "../game/dangerous.js";
import { shipFunctionName } from "../ship/render.js";
import type { MergedCommand } from "./merged.js";
import type { GameAction } from "../game/types.js";
import { groupLabel, labelFor, unavailableLabel, type Lang } from "./labels.js";

/** Un groupe de la liste déroulante = une catégorie d'actions du jeu. */
export type ActionGroup = { category: string };

export const ACTOR_GROUPS: ActionGroup[] = [{ category: "player" }, { category: "player_emotes" }];

/** Commandes vaisseau et siège sans état (Ship Action). */
export const SHIP_GROUPS: ActionGroup[] = [
	{ category: "spaceship_general" },
	{ category: "spaceship_movement" },
	{ category: "spaceship_power" },
	{ category: "spaceship_quantum" },
	{ category: "spaceship_radar" },
	{ category: "spaceship_target_hailing" },
	{ category: "spaceship_docking" },
	{ category: "seat_general" },
	{ category: "lights_controller" },
];

/** Format des sources de données de `sdpi-components` (élément ou groupe). */
export type DataSourceItem =
	| { label: string; value: string; disabled?: boolean }
	| { label: string; children: DataSourceItem[] };

/**
 * Liste groupée des actions des catégories demandées, dans l'ordre des groupes, triées par libellé.
 * Une action enregistrée (`selected`) absente de la liste est ajoutée en tête, marquée indisponible,
 * pour que le réglage ne soit pas perdu en silence. Les actions dangereuses ne sont jamais proposées.
 * `merged` : regroupements on / off / bascule présentés en une seule ligne (valeur `group:…`) quand le
 * jeu propose au moins deux de leurs commandes ; placés dans la catégorie de leurs commandes.
 */
export function buildDropdown(
	actions: GameAction[],
	groups: ActionGroup[],
	lang: Lang,
	selected?: string,
	merged: readonly MergedCommand[] = [],
): DataSourceItem[] {
	const offered = actions.filter((a) => !DANGEROUS_ACTIONS.has(a.name));
	const entries = offered.map((a) => ({ category: a.category, label: labelFor(a.name, lang), value: a.name }));
	for (const g of merged) {
		const members = offered.filter((a) => a.name === g.on || a.name === g.off || a.name === g.toggle);
		if (members.length < 2) continue;
		const names = new Set(members.map((m) => m.name));
		for (let i = entries.length - 1; i >= 0; i--) if (names.has(entries[i].value)) entries.splice(i, 1);
		entries.push({ category: members[0].category, label: shipFunctionName(g.fn, lang), value: g.id });
	}
	const items: DataSourceItem[] = [];
	let found = false;
	for (const { category } of groups) {
		const children = entries
			.filter((e) => e.category === category)
			.map(({ label, value }) => ({ label, value }))
			.sort((x, y) => x.label.localeCompare(y.label, lang));
		if (children.length === 0) continue;
		found ||= children.some((c) => c.value === selected);
		items.push({ label: groupLabel(category, lang), children });
	}
	if (selected && !found) items.unshift({ label: unavailableLabel(selected, lang), value: selected });
	return items;
}
