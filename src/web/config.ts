import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Réglages de l'appli web, enregistrés dans `settings.json`. */
export type WebSettings = { port: number; lan: boolean; token: string };

export const DEFAULT_PORT = 8743;
const MIN_TOKEN = 32;

/** Dossier des réglages : `%APPDATA%\SC Telemetry Deck` (ou le dossier personnel à défaut). */
export function defaultSettingsDir(): string {
	return path.join(process.env.APPDATA ?? os.homedir(), "SC Telemetry Deck");
}

const newToken = () => crypto.randomBytes(24).toString("base64url");

/**
 * Lit les réglages (dossier et fichier créés au besoin). Champ absent ou invalide → valeur par défaut ;
 * fichier illisible → réglages neufs, l'ancien gardé en `settings.json.bak`. Le résultat est réécrit.
 */
export function loadSettings(dir: string): WebSettings {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "settings.json");
	let raw: Record<string, unknown> = {};
	if (fs.existsSync(file)) {
		const text = fs.readFileSync(file, "utf-8");
		try {
			const parsed: unknown = JSON.parse(text);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
			else throw new Error("format");
		} catch {
			fs.writeFileSync(`${file}.bak`, text);
		}
	}
	const port = Number.isInteger(raw.port) && (raw.port as number) >= 1 && (raw.port as number) <= 65535 ? (raw.port as number) : DEFAULT_PORT;
	const settings: WebSettings = {
		port,
		lan: raw.lan === true,
		token: typeof raw.token === "string" && raw.token.length >= MIN_TOKEN ? raw.token : newToken(),
	};
	fs.writeFileSync(file, `${JSON.stringify(settings, null, "\t")}\n`);
	return settings;
}
