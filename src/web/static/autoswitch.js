// Changement de vue automatique : selon la position du perso (à pied, assis, EVA), ouvre la vue choisie pour cette
// position. Réglage propre à chaque appareil. Bascule après une position stable, jamais pendant l'édition d'une vue,
// et respecte un changement d'onglet fait à la main jusqu'au prochain vrai changement de position.

export const POSITIONS = ["on_foot", "seated", "eva"];

/**
 * Cible de chaque position : un onglet (`character`, `ship`) ou une vue (`view:<id>`) ; « » = ne pas changer.
 * Par défaut : à pied → onglet Personnage, assis → onglet Vaisseau.
 */
export const DEFAULTS = { on_foot: "character", seated: "ship", eva: "" };

/**
 * Réglages lus avec tolérance (stockage vide ou abîmé → désactivé).
 * @param {string | null} raw
 * @returns {{ enabled: boolean, on_foot: string, seated: string, eva: string }}
 */
export function parseAutoSettings(raw) {
	let o = {};
	try {
		const parsed = raw ? JSON.parse(raw) : {};
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) o = parsed;
	} catch {
		/* réglage abîmé : désactivé */
	}
	// Position non réglée → défaut ; « » enregistré = « ne pas changer » choisi exprès.
	const pick = (x, fallback) => (typeof x === "string" ? x : fallback);
	return {
		enabled: o.enabled === true,
		on_foot: pick(o.on_foot, DEFAULTS.on_foot),
		seated: pick(o.seated, DEFAULTS.seated),
		eva: pick(o.eva, DEFAULTS.eva),
	};
}

/**
 * @param {object} o
 * @param {() => { enabled: boolean, on_foot: string, seated: string, eva: string }} o.getSettings
 * @param {(target: string) => boolean} o.viewExists la cible (onglet ou `view:<id>`) existe
 * @param {() => boolean} o.isEditing vue déverrouillée : ne pas basculer
 * @param {(target: string) => void} o.apply ouvre l'onglet ou la vue
 * @param {boolean} [o.skipInitial] page ouverte par un lien `?view=` : la position de départ ne déclenche rien
 * @param {number} [o.delayMs] position stable exigée (défaut 2 s)
 * @param {(fn: () => void, ms: number) => unknown} [o.setTimer]
 * @param {(id: unknown) => void} [o.clearTimer]
 */
export function createAutoSwitch(o) {
	const delay = o.delayMs ?? 2000;
	const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = o.clearTimer ?? ((id) => clearTimeout(id));
	/** Position actuelle (connue), et dernière position déjà traitée (bascule faite ou rien à faire). */
	let current = null;
	let handled = null;
	let first = true;
	let timer = null;
	/** Réglages au dernier changement : seule l'activation, ou la vue de la position actuelle, fait basculer. */
	let lastSettings = { ...o.getSettings() };

	function check() {
		timer = null;
		if (!current || current === handled) return;
		const s = o.getSettings();
		if (!s.enabled) return;
		const target = s[current];
		if (!target || !o.viewExists(target)) {
			handled = current;
			return;
		}
		// Édition en cours : on attend (retry() au verrouillage, ou nouvel essai plus tard).
		if (o.isEditing()) {
			timer = setTimer(check, delay);
			return;
		}
		handled = current;
		o.apply(target);
	}

	return {
		/** Position lue dans l'événement `state` (`on_foot`, `seated`, `eva` ; le reste est ignoré). */
		update(position) {
			if (!POSITIONS.includes(position)) return;
			if (first) {
				first = false;
				if (o.skipInitial) handled = position;
			}
			if (position === current) return;
			current = position;
			if (timer !== null) clearTimer(timer);
			timer = setTimer(check, delay);
		},
		/** Vue reverrouillée : une bascule en attente peut se faire maintenant. */
		retry() {
			if (timer !== null) clearTimer(timer);
			check();
		},
		/**
		 * Réglages modifiés. Basculent tout de suite seulement à l'activation, ou si la vue de la position actuelle
		 * a changé ; régler une autre position ne touche pas à l'onglet affiché.
		 */
		settingsChanged() {
			const next = o.getSettings();
			const turnedOn = next.enabled && !lastSettings.enabled;
			const currentChanged = current !== null && next[current] !== lastSettings[current];
			lastSettings = { ...next };
			if (!turnedOn && !currentChanged) return;
			handled = null;
			if (timer !== null) clearTimer(timer);
			check();
		},
		/** Onglet changé à la main : gardé jusqu'au prochain vrai changement de position. */
		userNavigated() {
			if (timer !== null) clearTimer(timer);
			timer = null;
			if (current) handled = current;
		},
	};
}
