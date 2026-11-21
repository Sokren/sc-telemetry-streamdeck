// Page de SC Telemetry Deck : grille de tuiles, onglets Personnage et Vaisseau, état en direct
// (Server-Sent Events), appuis. Utilise uniquement l'API publique v1 (la même que n'importe quel autre logiciel).
import { I18N } from "./i18n.js";

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
const params = new URLSearchParams(location.search);
let token = params.get("t") || storageGet(TOKEN_KEY);
if (params.get("t")) {
	storageSet(TOKEN_KEY, params.get("t"));
	params.delete("t");
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
	$("h-vitals").textContent = t("vitals");
	$("h-instruments").textContent = t("instruments");
	$("h-lights").textContent = t("warningLights");
	$("h-functions").textContent = t("functions");
	$("functions-hint").textContent = t("functionsHint");
	$("h-emotes").textContent = t("emotes");
	$("emotes-hint").textContent = t("emotesHint");
}

// ---------- Onglets ----------
const TABS = ["grid", "character", "ship"];
function showTab(name) {
	if (!TABS.includes(name)) name = "grid";
	for (const tab of TABS) {
		$(`panel-${tab}`).hidden = tab !== name;
		$(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
	}
	storageSet(TAB_KEY, name);
}
for (const tab of TABS) $(`tab-${tab}`).addEventListener("click", () => showTab(tab));

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
	});
	source.addEventListener("feedback", (e) => {
		const { index, feedback } = JSON.parse(e.data);
		const mine = ownPresses.get(index);
		if (mine !== undefined && Date.now() - mine < 3000) {
			ownPresses.delete(index);
			return;
		}
		flashOn(tileButton(index), feedback === "ok" ? "ok" : "alert");
	});
	source.onerror = async () => {
		setStatus("off", t("offline"));
		try {
			const r = await fetch("/api/v1/status", { headers: { authorization: `Bearer ${token}` } });
			if (r.status === 401) {
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

applyTexts();
showTab(storageGet(TAB_KEY) || "grid");
if (!token) {
	setStatus("off", "");
	showMessage(t("needToken"));
} else {
	connect();
}
