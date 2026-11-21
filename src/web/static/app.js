// Page de SC Telemetry Deck : grille de tuiles, onglets Personnage et Vaisseau, état en direct
// (Server-Sent Events), appuis. Utilise uniquement l'API publique v1 (la même que n'importe quel autre logiciel).
import { I18N } from "./i18n.js";
import { createLan } from "./lan.js";
import { createView } from "./view.js";

const TOKEN_KEY = "sctd-token";
const LANG_KEY = "sctd-lang";
const TAB_KEY = "sctd-tab";

function storageGet(k) {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
}
function storageSet(k, v) {
	try {
		localStorage.setItem(k, v);
	} catch {
		/* stockage indisponible : réglage gardé pour cette visite seulement */
	}
}

// Jeton : `?t=` (adresse donnée par l'appli), gardé puis retiré de l'adresse.
// Vue : `?view=<id>` ouvre cette vue, puis l'appareil garde son propre choix (paramètre retiré aussi).
const params = new URLSearchParams(location.search);
let token = params.get("t") || storageGet(TOKEN_KEY);
if (params.get("t")) storageSet(TOKEN_KEY, params.get("t"));
const viewParam = params.get("view");
if (params.has("t") || params.has("view")) {
	params.delete("t");
	params.delete("view");
	history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : ""));
}

let lang = storageGet(LANG_KEY) || (navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");
if (!(lang in I18N)) lang = "en";
const t = (key) => I18N[lang][key];

const $ = (id) => document.getElementById(id);
const grid = $("grid");
let source;
let lastState;

function setStatus(kind, text) {
	$("status").className = `status ${kind}`;
	$("status-text").textContent = text;
}

function showMessage(text) {
	$("message").textContent = text;
	$("message").hidden = !text;
}

function applyTexts() {
	document.documentElement.lang = lang;
	$("title").textContent = t("title");
	$("lang").textContent = t("language");
	$("api").textContent = t("api");
	$("tab-grid").textContent = t("tabGrid");
	$("tab-character").textContent = t("tabCharacter");
	$("tab-ship").textContent = t("tabShip");
	$("view-add").title = t("addView");
	$("view-add").setAttribute("aria-label", t("addView"));
	$("tab-select").setAttribute("aria-label", t("tabs"));
	renderTabs();
	$("h-vitals").textContent = t("vitals");
	$("h-instruments").textContent = t("instruments");
	$("h-lights").textContent = t("warningLights");
	$("h-functions").textContent = t("functions");
	$("functions-hint").textContent = t("functionsHint");
	$("h-emotes").textContent = t("emotes");
	$("about-open").textContent = t("about");
	$("about-close").textContent = t("close");
	renderAbout();
	$("emotes-hint").textContent = t("emotesHint");
	myView?.applyTexts();
	lanPanel?.applyTexts();
}

// ---------- À propos ----------
const REPO = "https://github.com/Sokren/sc-telemetry-streamdeck";
let lastStatus = {};

function renderAbout() {
	const s = lastStatus;
	$("about-title").textContent = t("aboutTitle");
	const actions = { available: t("actionsAvailable"), unsupported: t("actionsNone") }[s.actions] ?? t("actionsUnknown");
	const facts = [
		[t("aboutVersion"), s.version ? `v${s.version}` : "—"],
		[t("aboutSchema"), s.schema || "—"],
		[t("aboutActions"), actions],
		[t("aboutDev"), "Sokren"],
	];
	$("about-facts").replaceChildren(
		...facts.flatMap(([k, v]) => {
			const dt = document.createElement("dt");
			const dd = document.createElement("dd");
			dt.textContent = k;
			dd.textContent = v;
			return [dt, dd];
		}),
	);
	$("about-notes").replaceChildren(
		...["aboutAi", "aboutBeta", "aboutLocal", "aboutUnofficial"].map((k) => {
			const li = document.createElement("li");
			li.textContent = t(k);
			return li;
		}),
	);
	$("about-links").replaceChildren(
		...[
			[t("aboutGithub"), REPO],
			[t("aboutIssues"), `${REPO}/issues`],
		].map(([label, href]) => {
			const a = document.createElement("a");
			a.href = href;
			a.target = "_blank";
			a.rel = "noopener";
			a.textContent = label;
			return a;
		}),
	);
}
$("about-open").addEventListener("click", () => {
	renderAbout();
	$("about").showModal();
});

// ---------- Onglets ----------
// Onglets fixes, puis un onglet par vue (« view:<id> ») ; « ＋ » crée une vue. Téléphone : liste déroulante.
const TABS = ["grid", "character", "ship"];
const TAB_TEXT = { grid: "tabGrid", character: "tabCharacter", ship: "tabShip" };
const MAX_VIEWS = 10;
const ADD = "__add";
/** Vues connues (nom et id), dans l'ordre des onglets ; `null` tant que l'appli ne les a pas envoyées. */
let viewTabs = null;
let currentTab = "grid";

const viewId = (tab) => (tab.startsWith("view:") ? tab.slice(5) : null);

function renderTabs() {
	const box = $("view-tabs");
	const list = viewTabs ?? [];
	// Boutons gardés tant que les vues sont les mêmes (le focus clavier reste sur l'onglet choisi).
	if ([...box.children].map((b) => b.dataset.id).join("\n") !== list.map((v) => v.id).join("\n")) {
		const focused = document.activeElement?.closest?.("#view-tabs button")?.dataset.id;
		box.replaceChildren(
			...list.map((v) => {
				const b = document.createElement("button");
				b.type = "button";
				b.id = `tab-view-${v.id}`;
				b.dataset.id = v.id;
				b.setAttribute("role", "tab");
				b.setAttribute("aria-controls", "panel-myview");
				b.addEventListener("click", () => showTab(`view:${v.id}`));
				return b;
			}),
		);
		if (focused) document.getElementById(`tab-view-${focused}`)?.focus();
	}
	list.forEach((v, i) => {
		const b = box.children[i];
		b.textContent = v.name || t("viewNameEmpty");
		b.setAttribute("aria-selected", String(currentTab === `view:${v.id}`));
	});
	const shown = viewId(currentTab);
	if (shown) $("panel-myview").setAttribute("aria-labelledby", `tab-view-${shown}`);
	$("view-add").hidden = !viewTabs || viewTabs.length >= MAX_VIEWS;
	const select = $("tab-select");
	const options = [...TABS.map((tab) => [tab, t(TAB_TEXT[tab])]), ...(viewTabs ?? []).map((v) => [`view:${v.id}`, v.name || t("viewNameEmpty")])];
	if (viewTabs && viewTabs.length < MAX_VIEWS) options.push([ADD, `＋ ${t("addView")}`]);
	select.replaceChildren(
		...options.map(([value, text]) => {
			const o = document.createElement("option");
			o.value = value;
			o.textContent = text;
			return o;
		}),
	);
	select.value = currentTab;
}

function showTab(name) {
	const id = viewId(name);
	if (!TABS.includes(name) && id === null) name = "grid";
	// Vue inconnue (supprimée, lien périmé) : première vue, dès que la liste est connue.
	if (id !== null && viewTabs && !viewTabs.some((v) => v.id === id)) name = viewTabs[0] ? `view:${viewTabs[0].id}` : "grid";
	currentTab = name;
	for (const tab of TABS) {
		$(`panel-${tab}`).hidden = tab !== name;
		$(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
	}
	$("panel-myview").hidden = viewId(name) === null;
	storageSet(TAB_KEY, name);
	renderTabs();
	myView?.show(viewId(name));
	myView?.setVisible(viewId(name) !== null);
}
for (const tab of TABS) $(`tab-${tab}`).addEventListener("click", () => showTab(tab));

async function addView() {
	const id = await myView.addView();
	if (!id) return renderTabs();
	showTab(`view:${id}`);
	myView.editName();
}
$("view-add").addEventListener("click", addView);
$("tab-select").addEventListener("change", (e) => (e.target.value === ADD ? addView() : showTab(e.target.value)));

// ---------- Grille ----------
function tileButton(index) {
	let el = grid.children[index];
	while (!el) {
		const b = document.createElement("button");
		b.className = "tile";
		b.type = "button";
		b.innerHTML = '<img alt=""><span class="flash"></span>';
		const i = grid.children.length;
		b.addEventListener("click", () => press(i));
		grid.append(b);
		el = grid.children[index];
	}
	return el;
}

function flashOn(el, kind) {
	const f = el.querySelector(".flash");
	f.textContent = kind === "ok" ? "✔" : "⚠";
	f.className = `flash ${kind}`;
	setTimeout(() => (f.className = "flash"), 600);
}

// Appuis faits depuis cette page : leur retour diffusé à tous (événement « feedback ») est ignoré ici,
// la réponse de l'appui suffit (sinon ✔ / ⚠ clignoterait deux fois).
const ownPresses = new Map();

async function press(index) {
	ownPresses.set(index, Date.now());
	try {
		const r = await fetch(`/api/v1/layout/tiles/${index}/press`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
		if (r.status === 401) return showMessage(t("badToken"));
		const body = await r.json();
		flashOn(tileButton(index), body.feedback === "ok" ? "ok" : "alert");
	} catch {
		flashOn(tileButton(index), "alert");
	}
}

// ---------- Cartes (constantes, instruments) ----------
function card(item) {
	const el = document.createElement("div");
	el.className = `card level-${item.level ?? "none"}`;
	const value = item.text === "—" || !item.unit ? item.text : `${item.text} ${item.unit}`;
	el.innerHTML = '<div class="label"></div><div class="value"></div>';
	el.querySelector(".label").textContent = item.label;
	el.querySelector(".value").textContent = value;
	if (typeof item.percent === "number") {
		const bar = document.createElement("div");
		bar.className = "bar";
		bar.innerHTML = "<i></i>";
		bar.firstChild.style.width = `${Math.round(item.percent)}%`;
		el.append(bar);
	}
	return el;
}

function renderCharacter(c) {
	$("char-head").textContent = c.available ? [c.locomotionLabel, c.crewRoleLabel].filter((x) => x && x !== "—").join(" · ") : t("notSpawned");
	$("char-vitals").replaceChildren(...c.vitals.map(card));
}

// ---------- Émotes (liste lue dans le jeu, comme la liste déroulante du plugin) ----------
const EMOTES = "player_emotes";
let emotesLoaded = false;

async function loadEmotes() {
	try {
		const r = await fetch(`/api/v1/actions?lang=${lang}`, { headers: { authorization: `Bearer ${token}` } });
		if (!r.ok) throw new Error(String(r.status));
		const { groups, live } = await r.json();
		myView?.setActions(groups);
		const emotes = groups.find((g) => g.category === EMOTES)?.actions ?? [];
		renderEmotes(emotes);
		// Liste de secours (jeu pas encore joignable) : relue dès que le jeu répond.
		emotesLoaded = live && emotes.length > 0;
	} catch {
		renderEmotes([]);
	}
}

function renderEmotes(emotes) {
	const box = $("char-emotes");
	if (!emotes.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = t("emotesEmpty");
		return box.replaceChildren(empty);
	}
	box.replaceChildren(
		...emotes.map((e) => {
			const el = document.createElement("button");
			el.type = "button";
			el.className = "card function emote";
			el.innerHTML = '<div class="label"></div><span class="flash"></span>';
			el.querySelector(".label").textContent = e.label;
			el.addEventListener("click", () => triggerEmote(e.name, el));
			return el;
		}),
	);
}

/** Déclenche une action du jeu (émote ou autre) depuis une carte, avec retour ✔ / ⚠. */
async function triggerEmote(name, el) {
	try {
		const r = await fetch(`/api/v1/actions/${encodeURIComponent(name)}/trigger`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
		if (r.status === 401) return showMessage(t("badToken"));
		flashOn(el, r.status === 200 ? "ok" : "alert");
	} catch {
		flashOn(el, "alert");
	}
}

// ---------- Vaisseau ----------
async function pressFunction(id, el) {
	try {
		const r = await fetch(`/api/v1/ship/functions/${id}/press?lang=${lang}`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ mode: "toggle" }),
		});
		if (r.status === 401) return showMessage(t("badToken"));
		flashOn(el, r.status === 200 ? "ok" : "alert");
	} catch {
		flashOn(el, "alert");
	}
}

function renderShip(status, functions) {
	if (status.available) {
		const parts = [status.name, status.landed === null ? null : status.landed ? t("landed") : t("flying"), status.masterModeLabel];
		$("ship-head").textContent = parts.filter((x) => x && x !== "—").join(" · ");
	} else $("ship-head").textContent = t("notInShip");
	$("ship-instruments").replaceChildren(...status.instruments.map(card));
	$("ship-lights").replaceChildren(
		...status.annunciators.map((a) => {
			const el = document.createElement("span");
			el.className = `light light-${a.state}${a.flashing ? " flashing" : ""}`;
			el.textContent = a.label;
			return el;
		}),
	);
	// Les cartes de fonction sont gardées d'un rendu à l'autre (clic et ✔ / ⚠ stables).
	const box = $("ship-functions");
	functions.forEach((f, i) => {
		let el = box.children[i];
		if (!el || el.dataset.id !== f.id) {
			el = document.createElement("button");
			el.type = "button";
			el.className = "card function";
			el.dataset.id = f.id;
			el.innerHTML = '<div class="label"></div><div class="value"></div><span class="flash"></span>';
			el.addEventListener("click", () => pressFunction(f.id, el));
			if (box.children[i]) box.children[i].replaceWith(el);
			else box.append(el);
		}
		el.querySelector(".label").textContent = f.label;
		el.querySelector(".value").textContent = f.word;
		el.dataset.state = f.state;
	});
}

// ---------- Temps réel ----------
function connect() {
	source?.close();
	setStatus("", t("connecting"));
	loadEmotes();
	source = new EventSource(`/api/v1/events?t=${encodeURIComponent(token)}&lang=${lang}`);
	source.addEventListener("status", (e) => {
		const s = JSON.parse(e.data);
		lastStatus = s;
		if ($("about").open) renderAbout();
		// Version de l'appli (survol : version du jeu dont vient le schéma embarqué).
		$("version").textContent = s.version ? `v${s.version}` : "";
		$("version").title = s.schema ? `${t("gameSchema")} ${s.schema}` : "";
		setStatus(s.telemetry === "live" ? "live" : "", s.telemetry === "live" ? t("live") : t("noData"));
		if (s.telemetry === "live" && !emotesLoaded) loadEmotes();
		// Jeu sans commandes d'actions (ex. 4.10) : l'affichage marche, pas les boutons.
		$("notice").textContent = t("actionsUnsupported");
		$("notice").hidden = s.actions !== "unsupported";
	});
	source.addEventListener("tile", (e) => {
		const { index, image } = JSON.parse(e.data);
		const img = tileButton(index).querySelector("img");
		if (img.src !== image) img.src = image;
	});
	source.addEventListener("state", (e) => {
		lastState = JSON.parse(e.data);
		renderCharacter(lastState.character);
		renderShip(lastState.shipStatus, lastState.ship);
		myView?.setState(lastState);
	});
	source.addEventListener("views", (e) => myView?.setViews(JSON.parse(e.data).views));
	source.addEventListener("feedback", (e) => {
		const { index, feedback } = JSON.parse(e.data);
		const mine = ownPresses.get(index);
		if (mine !== undefined && Date.now() - mine < 3000) {
			ownPresses.delete(index);
			return;
		}
		flashOn(tileButton(index), feedback === "ok" ? "ok" : "alert");
	});
	// Flux remplacé entre-temps (nouveau jeton, langue) : ses erreurs ne concernent plus la page.
	const mine = source;
	source.onerror = async () => {
		if (mine !== source) return;
		setStatus("off", t("offline"));
		const used = token;
		try {
			const r = await fetch("/api/v1/status", { headers: { authorization: `Bearer ${used}` } });
			if (r.status === 401 && mine === source && used === token) {
				// Nouveau jeton créé dans un autre onglet du PC : repris ici au lieu de « jeton refusé ».
				const stored = storageGet(TOKEN_KEY);
				if (stored && stored !== used) {
					token = stored;
					return connect();
				}
				source.close();
				showMessage(t("badToken"));
			}
		} catch {
			/* l'appli est fermée : EventSource se reconnecte seul */
		}
	};
}

$("lang").addEventListener("click", () => {
	lang = lang === "fr" ? "en" : "fr";
	storageSet(LANG_KEY, lang);
	applyTexts();
	grid.replaceChildren();
	$("ship-functions").replaceChildren();
	connect();
});

// ---------- Ma vue ----------
const myView = createView({
	t,
	token: () => token,
	lang: () => lang,
	onViewsChanged(list) {
		const first = !viewTabs;
		viewTabs = list.map((v) => ({ id: v.id, name: v.name }));
		// Première liste : l'onglet demandé (lien ou dernier choix) peut maintenant être vérifié.
		if (first && viewId(currentTab) !== null) return showTab(currentTab);
		renderTabs();
	},
	onMissing() {
		if (viewTabs?.[0]) showTab(`view:${viewTabs[0].id}`);
		else showTab("grid");
	},
	card,
	pressFunction,
	triggerAction: triggerEmote,
	showMessage,
	storage: { get: storageGet, set: storageSet },
});

// ---------- Tablette / téléphone (PC seulement) ----------
const lanPanel = createLan({
	t,
	token: () => token,
	setToken(next) {
		// Nouveau jeton : gardé, puis reconnexion (les flux ouverts avec l'ancien sont fermés par l'appli).
		token = next;
		storageSet(TOKEN_KEY, next);
		showMessage("");
		connect();
	},
	views: () => viewTabs ?? [],
	currentView: () => viewId(currentTab),
});

applyTexts();
// Onglet de départ : lien `?view=`, sinon dernier choix de l'appareil (ancien « myview » → première vue).
const savedTab = storageGet(TAB_KEY);
showTab(viewParam ? `view:${viewParam}` : savedTab === "myview" ? "view:main" : savedTab || "grid");
if (!token) {
	setStatus("off", "");
	showMessage(t("needToken"));
} else {
	connect();
	lanPanel.check();
}
