// Fenêtre « Tablette / téléphone » : accès depuis le réseau local, QR code, lien, jeton. Sur le PC seulement
// (l'API répond 403 aux autres appareils). Adresse et QR code masqués à chaque ouverture : aucune IP à l'écran
// sans action explicite.

const POLL_MS = 3000;

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const button = (cls, text) => {
	const b = el("button", cls, text);
	b.type = "button";
	return b;
};

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {() => string} ctx.token
 * @param {(token: string) => void} ctx.setToken nouveau jeton : à garder et à utiliser pour se reconnecter
 * @param {() => {id: string, name: string}[]} ctx.views vues disponibles (onglets)
 * @param {() => string | null} ctx.currentView vue affichée, sinon `null`
 */
export function createLan(ctx) {
	const { t } = ctx;
	const openBtn = document.getElementById("lan-open");
	const dialog = document.getElementById("lan");
	let state = null;
	let shown = false;
	let openOn = null;
	let qrUrl = null;
	let qrKey = "";
	let timer;
	let busy = false;
	let notice = "";

	const fmt = (key, ...args) => args.reduce((s, a, i) => s.replace(`{${i}}`, () => a), t(key));
	const api = (path, init = {}) =>
		fetch(path, { ...init, headers: { authorization: `Bearer ${ctx.token()}`, ...(init.body ? { "content-type": "application/json" } : {}) } });

	/** Lien complet de la vue choisie (avec le jeton). */
	const link = () => (state?.url ? state.url + (openOn ? `&view=${encodeURIComponent(openOn)}` : "") : "");

	async function load() {
		try {
			const r = await api("/api/v1/lan");
			if (r.status !== 200) return false;
			state = await r.json();
			return true;
		} catch {
			return false;
		}
	}

	async function change(body) {
		busy = true;
		notice = "";
		try {
			const r = await api("/api/v1/lan", { method: "PUT", body: JSON.stringify(body) });
			if (r.status === 200) state = await r.json();
			else {
				if (r.status === 500) notice = t("lanListenFailed");
				else notice = t("lanFailed");
				await load();
			}
		} catch {
			notice = t("lanFailed");
		}
		busy = false;
		render();
	}

	async function refreshQr() {
		const key = state?.enabled && state.url ? `${state.url}|${openOn ?? ""}` : "";
		if (key === qrKey) return;
		qrKey = key;
		if (qrUrl) URL.revokeObjectURL(qrUrl);
		qrUrl = null;
		if (!key) return;
		try {
			const r = await api(`/api/v1/lan/qr${openOn ? `?view=${encodeURIComponent(openOn)}` : ""}`);
			if (r.ok && qrKey === key) qrUrl = URL.createObjectURL(await r.blob());
		} catch {
			/* QR indisponible : le lien reste copiable */
		}
		render();
	}

	async function copy() {
		const text = link();
		try {
			await navigator.clipboard.writeText(text);
			notice = t("lanCopied");
		} catch {
			// Repli : sélection d'un champ caché (navigateurs sans presse-papiers asynchrone).
			const area = el("textarea");
			area.value = text;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.append(area);
			area.select();
			const ok = document.execCommand("copy");
			area.remove();
			notice = ok ? t("lanCopied") : t("lanCopyFailed");
		}
		render();
	}

	async function newToken() {
		if (!confirm(t("lanNewTokenConfirm"))) return;
		try {
			const r = await api("/api/v1/lan/token", { method: "POST" });
			if (r.status !== 200) throw new Error(String(r.status));
			ctx.setToken((await r.json()).token);
			qrKey = "";
			await load();
			notice = t("lanNewTokenDone");
			refreshQr();
		} catch {
			notice = t("lanFailed");
		}
		render();
	}

	function devicesText(d) {
		const total = d.others + (d.pc ? 1 : 0);
		const others = d.others === 0 ? null : d.others === 1 ? t("lanOneDevice") : fmt("lanNDevices", d.others);
		const detail = [d.pc ? t("lanThisPc") : null, others].filter(Boolean).join(" + ");
		return detail ? `${t("lanDevices")} ${total} (${detail})` : `${t("lanDevices")} 0`;
	}

	function render() {
		if (!dialog.open) return;
		const on = !!state?.enabled;
		const box = el("div", `lan-dlg${on ? " on" : ""}`);
		box.append(el("h2", "", t("lanTitle")), el("p", "lan-sub", t("lanSub")));

		// Interrupteur
		const sw = el("label", "lan-sw");
		const input = el("input");
		input.type = "checkbox";
		input.setAttribute("role", "switch");
		input.checked = on;
		input.disabled = busy || !state;
		input.addEventListener("change", () => change({ enabled: input.checked }));
		const text = el("div");
		text.append(el("b", "", t("lanAllow")), el("small", "", on ? t("lanOn") : t("lanOff")));
		sw.append(input, el("span", "lan-tog"), text);
		box.append(sw);
		if (!on) box.append(el("p", "lan-off-note", t("lanFirewall")));
		if (state?.error === "listen_failed" && !notice) box.append(el("p", "lan-error", t("lanListenFailed")));
		if (on && !state.url) box.append(el("p", "lan-error", t("lanNoNetwork")));

		if (on && state.url) {
			const body = el("div", "lan-body");
			// QR code (masqué : flou + voile)
			const qrw = el("div", `lan-qrw${shown ? "" : " hid"}`);
			const img = el("img", "lan-qr");
			img.alt = t("lanQrAlt");
			if (qrUrl) img.src = qrUrl;
			qrw.append(img);
			if (!shown) {
				const mask = el("div", "lan-mask");
				const show = button("", t("lanShow"));
				show.addEventListener("click", () => ((shown = true), render()));
				mask.append(el("span", "", "🙈"), el("span", "", t("lanQrHidden")), show);
				qrw.append(mask);
			}
			const info = el("div", "lan-info");
			info.append(el("p", "", t("lanScan")));
			const urlrow = el("div", "lan-urlrow");
			const url = el("div", "lan-url");
			if (shown) url.textContent = link();
			else url.append(el("span", "lan-dots", "••••••••••••••••••••••••"));
			const eye = button("", shown ? t("lanHide") : t("lanShow"));
			eye.addEventListener("click", () => ((shown = !shown), render()));
			urlrow.append(url, eye);
			info.append(urlrow);

			// Vue ouverte par le lien, carte réseau
			const opts = el("div", "lan-opts");
			const openLabel = el("label", "", `${t("lanOpenOn")} `);
			const openSel = el("select");
			for (const [value, label] of [["", t("lanOpenLast")], ...ctx.views().map((v) => [v.id, v.name])]) {
				const o = el("option", "", label);
				o.value = value;
				openSel.append(o);
			}
			openSel.value = openOn ?? "";
			openSel.addEventListener("change", () => {
				openOn = openSel.value || null;
				refreshQr();
				render();
			});
			openLabel.append(openSel);
			opts.append(openLabel);
			if (state.networks) {
				const netLabel = el("label", "", `${t("lanNetwork")} `);
				const netSel = el("select");
				for (const n of state.networks) {
					const o = el("option", "", n.name);
					o.value = n.id;
					netSel.append(o);
				}
				netSel.value = state.network ?? "";
				netSel.disabled = busy;
				netSel.addEventListener("change", () => change({ network: netSel.value }));
				netLabel.append(netSel);
				opts.append(netLabel);
			}
			info.append(opts);

			const row = el("div", "lan-row");
			const copyBtn = button("", t("lanCopy"));
			copyBtn.addEventListener("click", copy);
			const tokenBtn = button("", t("lanNewToken"));
			tokenBtn.addEventListener("click", newToken);
			row.append(copyBtn, tokenBtn);
			info.append(row, el("p", "lan-dev", devicesText(state.devices)));
			body.append(qrw, info);
			box.append(body);
		}
		if (notice) box.append(el("p", "lan-notice", notice));

		if (on) {
			// Option avancée : toutes les interfaces (0.0.0.0), avec ses risques.
			const adv = el("details", "lan-adv");
			adv.open = !!state.all;
			adv.append(el("summary", "", t("lanAdvanced")));
			const all = el("label", "lan-all");
			const allInput = el("input");
			allInput.type = "checkbox";
			allInput.checked = !!state.all;
			allInput.disabled = busy;
			allInput.addEventListener("change", () => {
				if (allInput.checked && !confirm(t("lanAllConfirm"))) return (allInput.checked = false);
				change({ all: allInput.checked });
			});
			all.append(allInput, el("span", "", t("lanAll")));
			adv.append(all, el("p", "lan-warn", t("lanAllWarn")));
			box.append(adv);

			const notes = el("div", "lan-note");
			for (const key of ["lanNoteMasked", "lanNoteToken", "lanNoteUnencrypted"]) notes.append(el("div", "", t(key)));
			box.append(notes);
		}

		const foot = el("form", "lan-foot");
		foot.method = "dialog";
		const close = el("button", "", t("close"));
		close.type = "submit";
		foot.append(close);
		box.append(foot);
		dialog.replaceChildren(box);
	}

	async function poll() {
		clearTimeout(timer);
		if (!dialog.open) return;
		// Redessiné seulement si quelque chose a changé (une liste ouverte ou le focus ne doit pas sauter).
		const before = JSON.stringify(state);
		if (!busy && (await load()) && JSON.stringify(state) !== before) {
			await refreshQr();
			render();
		}
		timer = setTimeout(poll, POLL_MS);
	}

	openBtn.addEventListener("click", async () => {
		// Masqué à chaque ouverture ; vue proposée : celle affichée.
		shown = false;
		notice = "";
		openOn = ctx.currentView();
		dialog.showModal();
		render();
		await load();
		await refreshQr();
		render();
		timer = setTimeout(poll, POLL_MS);
	});
	dialog.addEventListener("close", () => {
		clearTimeout(timer);
		shown = false;
	});

	return {
		/** Bouton visible seulement si l'appli répond (PC) ; à rappeler après un changement de jeton. */
		async check() {
			openBtn.hidden = !(await load());
		},
		applyTexts() {
			openBtn.textContent = t("lanButton");
			dialog.setAttribute("aria-label", t("lanTitle"));
			render();
		},
	};
}
