// Onglets « Ma vue » : vues nommées faites de sections et de cases composées par l'utilisateur, enregistrées
// dans l'appli (une route par vue : /api/v1/views/{id}) et rendues à partir de l'événement « state ». Édition au cadenas : glisser-déposer souris + tactile (événements
// pointer), menu « Ajouter », largeur, taille, renommage. Aucune bibliothèque.

const MAX_SECTIONS = 20;
const MAX_ITEMS = 40;
const MAX_TITLE = 40;
const MAX_NAME = 24;
const MAX_VIEWS = 10;
const SAVE_DELAY = 400;
const DRAG_THRESHOLD = 6;
const UNLOCK_KEY = "sctd-view-unlocked";
const EMOTES = "player_emotes";
/** Valeurs affichées en jauge (barre), pour le type indiqué dans le menu « Ajouter ». */
const GAUGES = ["health", "oxygen", "hunger", "thirst", "body_temperature", "shields", "hull", "decoys", "noise", "hydrogen", "quantum"];

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const button = (cls, text, title) => {
	const b = el("button", cls, text);
	b.type = "button";
	if (title) {
		b.title = title;
		b.setAttribute("aria-label", title);
	}
	return b;
};

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {() => string} ctx.token
 * @param {() => string} ctx.lang langue de la page (nom par défaut figé à la première écriture)
 * @param {(views: {id: string, name: string}[]) => void} ctx.onViewsChanged liste à jour (onglets)
 * @param {() => void} ctx.onMissing la vue affichée n'existe plus (supprimée ailleurs)
 * @param {(item: object) => HTMLElement} ctx.card carte (constante, instrument) commune aux onglets
 * @param {(id: string, el: HTMLElement) => void} ctx.pressFunction
 * @param {(name: string, el: HTMLElement) => void} ctx.triggerAction
 * @param {(text: string) => void} ctx.showMessage
 * @param {{ get(k: string): string | null, set(k: string, v: string): void }} ctx.storage
 */
export function createView(ctx) {
	const { t } = ctx;
	const root = document.getElementById("myview");
	const lockBtn = document.getElementById("view-lock");
	/** Toutes les vues (dernière liste reçue, avec la vue affichée telle qu'éditée ici). */
	let views = null;
	let currentId = null;
	/** Vue affichée (copie éditée localement). */
	let view = null;
	let state = null;
	let actionGroups = [];
	let unlocked = ctx.storage.get(UNLOCK_KEY) === "1";
	let visible = false;
	let saveTimer;
	let drag = null;
	/** Cases affichées : id → mise à jour à partir de `state`. */
	let updaters = new Map();

	// ---------- Libellés ----------
	const fmt = (key, ...args) => args.reduce((s, a, i) => s.replace(`{${i}}`, a), t(key));
	const INFO = {
		character_info: { position: "infoPosition", role: "infoRole", seat: "infoSeat" },
		ship_info: { name: "infoShipName", master_mode: "infoMasterMode", landed: "infoLanded" },
	};
	function actionLabel(name) {
		for (const g of actionGroups) for (const a of g.actions) if (a.name === name) return a.label;
		return name;
	}
	function labelOf(item) {
		switch (item.kind) {
			case "vital":
				return state?.vitals.find((v) => v.id === item.ref)?.label ?? item.ref;
			case "instrument":
				return state?.shipStatus.instruments.find((i) => i.id === item.ref)?.label ?? item.ref;
			case "ship_function":
				return state?.ship.find((f) => f.id === item.ref)?.label ?? item.ref;
			case "annunciators":
				return t("warningLights");
			case "action":
				return actionLabel(item.ref);
			default:
				return t(INFO[item.kind][item.ref]);
		}
	}

	// ---------- Rendu des cases ----------
	function infoText(item) {
		if (!state) return "—";
		if (item.kind === "character_info") {
			const c = state.character;
			if (!c.available) return "—";
			if (item.ref === "position") return c.locomotionLabel;
			if (item.ref === "role") return c.crewRoleLabel;
			return c.seat ?? "—";
		}
		const s = state.shipStatus;
		if (!s.available) return "—";
		if (item.ref === "name") return s.name ?? "—";
		if (item.ref === "master_mode") return s.masterModeLabel;
		return s.landed === null ? "—" : s.landed ? t("landed") : t("flying");
	}

	/** Contenu d'une case et sa fonction de mise à jour. */
	function itemContent(item) {
		const box = el("div", "vcontent");
		const empty = (label) => ({ label, text: "—", unit: "", level: "none" });
		switch (item.kind) {
			case "vital":
			case "instrument": {
				const update = () => {
					const list = item.kind === "vital" ? state?.vitals : state?.shipStatus.instruments;
					const data = list?.find((x) => x.id === item.ref) ?? empty(labelOf(item));
					box.replaceChildren(ctx.card(data));
				};
				return { box, update };
			}
			case "character_info":
			case "ship_info": {
				const update = () => box.replaceChildren(ctx.card({ label: labelOf(item), text: infoText(item), unit: "", level: "none" }));
				return { box, update };
			}
			case "annunciators": {
				const card = el("div", "card");
				const lights = el("div", "lights");
				card.append(el("div", "label", t("warningLights")), lights);
				box.append(card);
				const update = () => {
					const list = state?.shipStatus.annunciators ?? [];
					lights.replaceChildren(
						...list.map((a) => {
							const s = el("span", `light light-${a.state}${a.flashing ? " flashing" : ""}`, a.label);
							return s;
						}),
					);
				};
				return { box, update };
			}
			case "ship_function": {
				const b = button("card function");
				b.append(el("div", "label"), el("div", "value"), el("span", "flash"));
				b.addEventListener("click", () => {
					if (!unlocked) ctx.pressFunction(item.ref, b);
				});
				box.append(b);
				const update = () => {
					const f = state?.ship.find((x) => x.id === item.ref);
					b.querySelector(".label").textContent = f?.label ?? labelOf(item);
					b.querySelector(".value").textContent = f?.word ?? "—";
					b.dataset.state = f?.state ?? "unknown";
				};
				return { box, update };
			}
			case "action": {
				const b = button("card function emote");
				b.append(el("div", "label"), el("span", "flash"));
				b.addEventListener("click", () => {
					if (!unlocked) ctx.triggerAction(item.ref, b);
				});
				box.append(b);
				const update = () => (b.querySelector(".label").textContent = actionLabel(item.ref));
				return { box, update };
			}
		}
		return { box, update: () => {} };
	}

	function renderItem(section, item) {
		const wrap = el("div", `vitem s${item.size}`);
		wrap.dataset.id = item.id;
		const { box, update } = itemContent(item);
		wrap.append(box);
		if (unlocked) {
			const ctl = el("div", "vctl");
			const size = button("", item.size === 1 ? "2×" : "1×", t("itemSize"));
			size.addEventListener("click", () => {
				item.size = item.size === 1 ? 2 : 1;
				changed();
			});
			const del = button("", "✕", t("removeItem"));
			del.addEventListener("click", () => {
				section.items = section.items.filter((i) => i !== item);
				changed();
			});
			ctl.append(size, del);
			wrap.append(ctl);
			wrap.addEventListener("pointerdown", (e) => startDrag(e, "item", wrap));
		}
		update();
		updaters.set(item.id, update);
		return wrap;
	}

	function renderSection(section) {
		const sec = el("section", `vsec ${section.width}`);
		sec.dataset.id = section.id;
		const head = el("div", "vhead");
		if (unlocked) {
			const input = el("input", "vtitle-input");
			input.value = section.title;
			input.maxLength = MAX_TITLE;
			input.setAttribute("aria-label", t("sectionTitle"));
			input.addEventListener("input", () => {
				section.title = input.value;
				scheduleSave();
			});
			input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
			head.append(input);
			const ctl = el("div", "vsctl");
			const width = button("", section.width === "half" ? "½ → 1" : "1 → ½", t("sectionWidth"));
			width.addEventListener("click", () => {
				section.width = section.width === "half" ? "full" : "half";
				changed();
			});
			const handle = button("vhandle", "⋮⋮", t("moveSection"));
			handle.addEventListener("pointerdown", (e) => startDrag(e, "section", sec));
			const del = button("", "✕", t("deleteSection"));
			del.addEventListener("click", () => {
				if (section.items.length && !confirm(fmt("confirmDeleteSection", section.title))) return;
				view.sections = view.sections.filter((s) => s !== section);
				changed();
			});
			ctl.append(width, handle, del);
			head.append(ctl);
		} else head.append(el("h2", "vtitle", section.title));
		const grid = el("div", "vgrid");
		grid.append(...section.items.map((i) => renderItem(section, i)));
		sec.append(head, grid);
		if (unlocked && section.items.length < MAX_ITEMS) {
			const add = button("vadd", fmt("addIn", section.title));
			add.addEventListener("click", () => openMenu(section, add));
			sec.append(add);
		} else if (!section.items.length) sec.append(el("p", "hint", t("emptySection")));
		return sec;
	}

	function render() {
		closeMenu();
		updaters = new Map();
		root.classList.toggle("editing", unlocked);
		if (!view) return root.replaceChildren(el("p", "hint", t("connecting")));
		const list = el("div", "vsections");
		list.append(...view.sections.map(renderSection));
		const parts = unlocked ? [renderViewHead(), list] : [list];
		if (unlocked && view.sections.length < MAX_SECTIONS) {
			const add = button("vnewsec", t("addSection"));
			add.addEventListener("click", () => {
				const section = { id: newId(), title: t("newSection"), width: "half", items: [] };
				view.sections.push(section);
				changed();
				const input = root.querySelector(`.vsec[data-id="${section.id}"] .vtitle-input`);
				input?.focus();
				input?.select();
			});
			parts.push(add);
		}
		if (!view.sections.length && !unlocked) parts.push(el("p", "hint", t("viewEmpty")));
		parts.push(el("p", "hint vhint", unlocked ? t("viewHintEdit") : t("viewHintLocked")));
		root.replaceChildren(...parts);
	}

	/** En édition : nom de la vue et suppression. */
	function renderViewHead() {
		const head = el("div", "vviewhead");
		const input = el("input", "vname-input");
		input.value = view.name;
		input.maxLength = MAX_NAME;
		input.setAttribute("aria-label", t("viewName"));
		input.title = t("viewName");
		input.addEventListener("input", () => {
			view.name = input.value;
			publish();
			scheduleSave();
		});
		input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
		// Nom effacé : l'appli enregistre « Vue » / « View » ; l'afficher tout de suite (onglet jamais vide).
		input.addEventListener("blur", () => {
			if (view.name.trim()) return;
			view.name = input.value = t("viewNameEmpty");
			publish();
			scheduleSave();
		});
		head.append(input);
		if (views && views.length > 1) {
			const del = button("vdelview", t("deleteView"));
			del.addEventListener("click", deleteView);
			head.append(del);
		}
		return head;
	}

	function renderLock() {
		lockBtn.hidden = !visible;
		lockBtn.textContent = unlocked ? t("viewDone") : t("viewLocked");
		lockBtn.classList.toggle("open", unlocked);
	}

	// ---------- Enregistrement ----------
	function newId() {
		const used = new Set(view.sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]));
		let id;
		do id = Math.random().toString(36).slice(2, 10);
		while (used.has(id));
		return id;
	}

	function changed() {
		render();
		scheduleSave();
	}

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, SAVE_DELAY);
	}

	const api = (path, init = {}) =>
		fetch(`${path}?lang=${ctx.lang()}`, {
			...init,
			headers: { authorization: `Bearer ${ctx.token()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
		});

	/** Enregistre la vue affichée (elle seule : les autres vues ne sont pas touchées). */
	async function save() {
		clearTimeout(saveTimer);
		saveTimer = undefined;
		if (!view) return;
		const id = view.id;
		try {
			const r = await api(`/api/v1/views/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name: view.name, sections: view.sections }) });
			if (r.status === 401) return ctx.showMessage(t("badToken"));
			if (r.status === 404) return id === currentId && ctx.onMissing();
			if (!r.ok) return ctx.showMessage(t("viewSaveFailed"));
			// Version normalisée par l'appli (nom ou titre vide, trop long) : reprise si rien n'a bougé depuis.
			const saved = await r.json();
			if (id === currentId && !busy() && JSON.stringify(saved) !== JSON.stringify(view)) {
				view = saved;
				publish();
				render();
			}
		} catch {
			ctx.showMessage(t("viewSaveFailed"));
		}
	}

	/** Édition en cours ici : une vue reçue ne doit pas remplacer la vue affichée. */
	function busy() {
		const typing = unlocked && document.activeElement?.matches?.(".vtitle-input, .vname-input");
		return Boolean(drag || saveTimer || typing);
	}

	/** Liste des vues avec la vue affichée telle qu'éditée ici, pour les onglets. */
	function publish() {
		if (!views) return;
		views = views.map((v) => (view && v.id === view.id ? view : v));
		ctx.onViewsChanged(views);
	}

	async function deleteView() {
		if (!view || !confirm(fmt("confirmDeleteView", view.name))) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		const id = view.id;
		try {
			const r = await api(`/api/v1/views/${encodeURIComponent(id)}`, { method: "DELETE" });
			if (r.status === 401) return ctx.showMessage(t("badToken"));
			if (r.status === 409) return ctx.showMessage(t("lastView"));
			if (r.status !== 204 && r.status !== 404) return ctx.showMessage(t("viewSaveFailed"));
		} catch {
			return ctx.showMessage(t("viewSaveFailed"));
		}
		views = views.filter((v) => v.id !== id);
		ctx.onViewsChanged(views);
		if (id === currentId) ctx.onMissing();
	}

	/** Nom proposé : « Vue N » avec le plus petit N ≥ 2 libre. */
	function newViewName() {
		const names = new Set((views ?? []).map((v) => v.name));
		let n = 2;
		while (names.has(fmt("newViewName", n))) n++;
		return fmt("newViewName", n);
	}

	// ---------- Menu « Ajouter » ----------
	const menu = el("div", "vmenu");
	menu.hidden = true;
	document.body.append(menu);
	let menuTab = "character";
	let menuSection = null;

	function menuEntries(tab) {
		const kindText = (k) => t(k);
		if (!state && tab !== "actions" && tab !== "emotes") return [];
		switch (tab) {
			case "character":
				return [
					...state.vitals.map((v) => ({ kind: "vital", ref: v.id, label: v.label, type: kindText(GAUGES.includes(v.id) ? "kindGauge" : "kindValue") })),
					...Object.keys(INFO.character_info).map((ref) => ({ kind: "character_info", ref, label: t(INFO.character_info[ref]), type: kindText("kindState") })),
				];
			case "ship":
				return [
					...state.shipStatus.instruments.map((i) => ({
						kind: "instrument",
						ref: i.id,
						label: i.label,
						type: kindText(GAUGES.includes(i.id) ? "kindGauge" : "kindValue"),
					})),
					{ kind: "annunciators", label: t("warningLights"), type: kindText("kindLights") },
					...Object.keys(INFO.ship_info).map((ref) => ({ kind: "ship_info", ref, label: t(INFO.ship_info[ref]), type: kindText("kindState") })),
					...state.ship.map((f) => ({ kind: "ship_function", ref: f.id, label: f.label, type: kindText("kindButton") })),
				];
			case "actions":
				return actionGroups
					.filter((g) => g.category !== EMOTES)
					.flatMap((g) => g.actions.map((a) => ({ kind: "action", ref: a.name, label: a.label, type: g.label })));
			case "emotes":
				return (actionGroups.find((g) => g.category === EMOTES)?.actions ?? []).map((a) => ({ kind: "action", ref: a.name, label: a.label, type: kindText("kindButton") }));
		}
		return [];
	}

	function renderMenu() {
		const tabs = el("div", "vmtabs");
		for (const [id, key] of [
			["character", "tabCharacter"],
			["ship", "tabShip"],
			["actions", "menuActions"],
			["emotes", "emotes"],
		]) {
			const b = button(id === menuTab ? "on" : "", t(key));
			b.addEventListener("click", () => {
				menuTab = id;
				renderMenu();
			});
			tabs.append(b);
		}
		const search = el("input", "vmsearch");
		search.type = "search";
		search.placeholder = t("search");
		const list = el("div", "vmlist");
		const fill = () => {
			const q = search.value.trim().toLowerCase();
			const entries = menuEntries(menuTab).filter((e) => !q || e.label.toLowerCase().includes(q));
			if (!entries.length) return list.replaceChildren(el("p", "hint", q ? t("noResult") : t("menuEmpty")));
			list.replaceChildren(
				...entries.map((entry) => {
					const b = button("vmi");
					b.append(el("span", "", entry.label), el("small", "", entry.type));
					b.addEventListener("click", () => addItem(entry));
					return b;
				}),
			);
		};
		search.addEventListener("input", fill);
		fill();
		menu.replaceChildren(tabs, search, list);
		return search;
	}

	function openMenu(section, anchor) {
		menuSection = section;
		menu.hidden = false;
		const search = renderMenu();
		const r = anchor.getBoundingClientRect();
		const width = Math.min(420, window.innerWidth - 16);
		menu.style.width = `${width}px`;
		menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + window.scrollX}px`;
		menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
		if (window.matchMedia("(pointer: fine)").matches) search.focus();
	}

	function closeMenu() {
		menu.hidden = true;
		menuSection = null;
	}

	function addItem(entry) {
		const section = menuSection;
		if (!section || section.items.length >= MAX_ITEMS) return closeMenu();
		// Même ordre de clés que la vue renvoyée par l'appli (comparaison des copies sans re-rendu inutile).
		const item = { id: newId(), kind: entry.kind, ...(entry.ref ? { ref: entry.ref } : {}), size: entry.kind === "annunciators" ? 2 : 1 };
		section.items.push(item);
		changed();
	}

	document.addEventListener("pointerdown", (e) => {
		if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.(".vadd")) closeMenu();
	});
	document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());

	// ---------- Glisser-déposer (souris + tactile) ----------
	function startDrag(e, type, node) {
		if (!unlocked || e.button > 0) return;
		// Les boutons 1× / 2× / ✕ restent cliquables ; le reste de la case sert de poignée.
		if (type === "item" && e.target.closest(".vctl")) return;
		drag = { type, node, id: node.dataset.id, x: e.clientX, y: e.clientY, started: false, pointer: e.pointerId };
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", cancelDrag);
	}

	function begin() {
		const r = drag.node.getBoundingClientRect();
		drag.started = true;
		drag.dx = drag.x - r.left;
		drag.dy = drag.y - r.top;
		const ghost = drag.node.cloneNode(true);
		ghost.classList.add("vghost");
		ghost.style.width = `${r.width}px`;
		ghost.style.height = `${r.height}px`;
		document.body.append(ghost);
		drag.ghost = ghost;
		const ph = el("div", `vph ${drag.node.className.replace(/\b(vitem|vsec)\b/, "")}`);
		ph.style.minHeight = `${Math.min(r.height, 140)}px`;
		drag.node.after(ph);
		drag.node.style.display = "none";
		drag.ph = ph;
		closeMenu();
	}

	function onMove(e) {
		if (!drag || e.pointerId !== drag.pointer) return;
		if (!drag.started) {
			if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
			begin();
		}
		e.preventDefault();
		drag.ghost.style.left = `${e.clientX - drag.dx}px`;
		drag.ghost.style.top = `${e.clientY - drag.dy}px`;
		const hit = document.elementFromPoint(e.clientX, e.clientY);
		if (!hit) return;
		if (drag.type === "item") {
			const target = hit.closest(".vitem");
			if (target && target !== drag.node && root.contains(target)) {
				const r = target.getBoundingClientRect();
				if (e.clientX < r.left + r.width / 2) target.before(drag.ph);
				else target.after(drag.ph);
				return;
			}
			const grid = hit.closest(".vsec")?.querySelector(".vgrid");
			if (grid && root.contains(grid) && drag.ph.parentElement !== grid) grid.append(drag.ph);
		} else {
			const target = hit.closest(".vsec");
			if (target && target !== drag.node && root.contains(target)) {
				const r = target.getBoundingClientRect();
				const before = target.classList.contains("half") && window.innerWidth >= 1000 ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
				if (before) target.before(drag.ph);
				else target.after(drag.ph);
			}
		}
		// Défilement automatique près des bords (tablette, longues vues).
		const edge = 60;
		if (e.clientY < edge) window.scrollBy(0, -12);
		else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
	}

	function onUp(e) {
		if (!drag || e.pointerId !== drag.pointer) return;
		const d = drag;
		stopListening();
		if (!d.started) return;
		if (d.type === "item") {
			const grid = d.ph.parentElement;
			const toSection = view.sections.find((s) => s.id === grid?.closest(".vsec")?.dataset.id);
			const fromSection = view.sections.find((s) => s.items.some((i) => i.id === d.id));
			if (toSection && fromSection && (toSection === fromSection || toSection.items.length < MAX_ITEMS)) {
				const item = fromSection.items.find((i) => i.id === d.id);
				fromSection.items = fromSection.items.filter((i) => i !== item);
				toSection.items.splice(countBefore(d.ph, "vitem", d.node), 0, item);
			}
		} else {
			const before = countBefore(d.ph, "vsec", d.node);
			const section = view.sections.find((s) => s.id === d.id);
			view.sections = view.sections.filter((s) => s !== section);
			view.sections.splice(before, 0, section);
		}
		d.ghost.remove();
		changed();
	}

	/** Nombre d'éléments de la classe donnée avant l'emplacement (l'élément déplacé, caché, n'est pas compté). */
	function countBefore(ph, cls, moved) {
		const siblings = [...ph.parentElement.children];
		return siblings.slice(0, siblings.indexOf(ph)).filter((c) => c.classList.contains(cls) && c !== moved).length;
	}

	function cancelDrag() {
		const d = drag;
		stopListening();
		if (d?.started) {
			d.ghost.remove();
			render();
		}
	}

	function stopListening() {
		drag = null;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", cancelDrag);
	}

	// ---------- Cadenas ----------
	lockBtn.addEventListener("click", () => {
		if (unlocked && saveTimer) save();
		setUnlocked(!unlocked);
	});

	function setUnlocked(v) {
		unlocked = v;
		ctx.storage.set(UNLOCK_KEY, unlocked ? "1" : "0");
		renderLock();
		render();
	}

	// ---------- Entrées depuis app.js ----------
	return {
		/** Vues reçues (connexion, ou création / modification / suppression depuis n'importe quel écran). */
		setViews(list) {
			const incoming = list.find((v) => v.id === currentId);
			// « Supprimer la vue » n'existe que s'il reste plus d'une vue : à redessiner quand ça change ailleurs.
			const deletable = (views?.length ?? 0) > 1;
			// Pendant un glisser, une saisie ou avant notre propre enregistrement, la vue affichée fait foi.
			const keep = view && incoming && busy();
			views = keep ? list.map((v) => (v.id === view.id ? view : v)) : list;
			ctx.onViewsChanged(views);
			if (currentId === null) return;
			if (!incoming) return ctx.onMissing();
			if (unlocked && !keep && view && deletable !== views.length > 1) render();
			if (keep || (view && JSON.stringify(incoming) === JSON.stringify(view))) return;
			view = structuredClone(incoming);
			render();
		},
		/** Affiche une vue (onglet choisi) ; `null` : aucune. Un enregistrement en attente de la vue précédente part d'abord. */
		show(id) {
			if (id === currentId) return;
			if (saveTimer) save();
			closeMenu();
			currentId = id;
			const found = views?.find((v) => v.id === id);
			view = found ? structuredClone(found) : null;
			if (id !== null && views && !found) return ctx.onMissing();
			render();
		},
		/** « ＋ » : crée une vue vide et renvoie son id (ou `null`), à ouvrir déverrouillée. */
		async addView() {
			const fail = (key) => (ctx.showMessage(t(key)), null);
			if (views && views.length >= MAX_VIEWS) return fail("tooManyViews");
			try {
				const r = await api("/api/v1/views", { method: "POST", body: JSON.stringify({ name: newViewName() }) });
				if (r.status === 401) return fail("badToken");
				if (r.status === 409) return fail("tooManyViews");
				if (!r.ok) return fail("viewSaveFailed");
				const created = await r.json();
				if (!views?.some((v) => v.id === created.id)) views = [...(views ?? []), created];
				ctx.onViewsChanged(views);
				return created.id;
			} catch {
				return fail("viewSaveFailed");
			}
		},
		/** Déverrouille et place le curseur dans le nom (vue tout juste créée). */
		editName() {
			setUnlocked(true);
			const input = root.querySelector(".vname-input");
			input?.focus();
			input?.select();
		},
		setState(s) {
			const first = !state;
			state = s;
			if (first) return render();
			for (const update of updaters.values()) update();
		},
		setActions(groups) {
			actionGroups = groups;
			for (const update of updaters.values()) update();
		},
		setVisible(v) {
			visible = v;
			renderLock();
			if (!v) closeMenu();
		},
		applyTexts() {
			renderLock();
			render();
		},
	};
}
