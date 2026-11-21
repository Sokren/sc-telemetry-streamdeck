// Page de SC Telemetry Deck : grille de tuiles, état en direct (Server-Sent Events), appuis.
// Utilise uniquement l'API publique v1 (la même que n'importe quel autre logiciel).
import { I18N } from "./i18n.js";

const TOKEN_KEY = "sctd-token";
const LANG_KEY = "sctd-lang";

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
const t = (key) => I18N[lang][key];

const $ = (id) => document.getElementById(id);
const grid = $("grid");
let source;

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
}

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

function flash(index, kind) {
	const f = tileButton(index).querySelector(".flash");
	f.textContent = kind === "ok" ? "✔" : "⚠";
	f.className = `flash ${kind}`;
	setTimeout(() => (f.className = "flash"), 600);
}

async function press(index) {
	try {
		const r = await fetch(`/api/v1/layout/tiles/${index}/press`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
		if (r.status === 401) return showMessage(t("badToken"));
		const body = await r.json();
		flash(index, body.feedback === "ok" ? "ok" : "alert");
	} catch {
		flash(index, "alert");
	}
}

function connect() {
	source?.close();
	setStatus("", t("connecting"));
	source = new EventSource(`/api/v1/events?t=${encodeURIComponent(token)}&lang=${lang}`);
	source.addEventListener("status", (e) => {
		const s = JSON.parse(e.data);
		setStatus(s.telemetry === "live" ? "live" : "", s.telemetry === "live" ? t("live") : t("noData"));
	});
	source.addEventListener("tile", (e) => {
		const { index, image } = JSON.parse(e.data);
		const img = tileButton(index).querySelector("img");
		if (img.src !== image) img.src = image;
	});
	source.addEventListener("feedback", (e) => {
		const { index, feedback } = JSON.parse(e.data);
		flash(index, feedback === "ok" ? "ok" : "alert");
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
	connect();
});

applyTexts();
if (!token) {
	setStatus("off", "");
	showMessage(t("needToken"));
} else {
	connect();
}
