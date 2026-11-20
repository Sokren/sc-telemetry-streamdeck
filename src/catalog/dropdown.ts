import type { GameAction } from "../game/types.js";
import { groupLabel, labelFor, unavailableLabel, type Lang } from "./labels.js";

/** Un groupe de la liste déroulante = une catégorie d'actions du jeu. */
export type ActionGroup = { category: string };

export const ACTOR_GROUPS: ActionGroup[] = [{ category: "player" }, { category: "player_emotes" }];

/** Format des sources de données de `sdpi-components` (élément ou groupe). */
export type DataSourceItem =
	| { label: string; value: string; disabled?: boolean }
	| { label: string; children: DataSourceItem[] };

/**
 * Liste groupée des actions des catégories demandées, dans l'ordre des groupes, triées par libellé.
 * Une action enregistrée (`selected`) absente de la liste est ajoutée en tête, marquée indisponible,
 * pour que le réglage ne soit pas perdu en silence.
 */
export function buildDropdown(actions: GameAction[], groups: ActionGroup[], lang: Lang, selected?: string): DataSourceItem[] {
	const items: DataSourceItem[] = [];
	let found = false;
	for (const { category } of groups) {
		const children = actions
			.filter((a) => a.category === category)
			.map((a) => ({ label: labelFor(a.name, lang), value: a.name }))
			.sort((x, y) => x.label.localeCompare(y.label, lang));
		if (children.length === 0) continue;
		found ||= children.some((c) => c.value === selected);
		items.push({ label: groupLabel(category, lang), children });
	}
	if (selected && !found) items.unshift({ label: unavailableLabel(selected, lang), value: selected });
	return items;
}
