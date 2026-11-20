import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };

export type Lang = "fr" | "en";

type LabelTable = { unavailable: string; groups: Record<string, string>; actions: Record<string, string> };
const TABLES: Record<Lang, LabelTable> = { fr, en };

/** Langue des libellés d'après celle du logiciel Stream Deck : français, sinon anglais. */
export function toLang(appLanguage: string): Lang {
	return appLanguage.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Libellé de secours tiré du nom technique : `emote_new_thing` → « New thing ». */
export function humanize(name: string): string {
	const words = name.replace(/^(emote_|v_)/, "").replace(/_/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelFor(name: string, lang: Lang): string {
	return TABLES[lang].actions[name] ?? humanize(name);
}

export function groupLabel(category: string, lang: Lang): string {
	return TABLES[lang].groups[category] ?? humanize(category);
}

export function unavailableLabel(name: string, lang: Lang): string {
	return `${labelFor(name, lang)} (${TABLES[lang].unavailable})`;
}
