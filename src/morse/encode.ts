// Code morse international (lettres et chiffres), rythme standard en unités.
const MORSE: Record<string, string> = {
	A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
	K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
	U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
	"0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
	"5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

const DOT = 1;
const DASH = 3;
const GAP_SIGN = 1;
const GAP_LETTER = 3;
const GAP_WORD = 7;

/** Majuscules, accents retirés, seuls A–Z / 0–9 / espaces gardés, espaces réduits. */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toUpperCase()
		.replace(/[^A-Z0-9 ]/g, "")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Instants (ms depuis le début) de chaque bascule de la torche : allumer, éteindre, allumer…
 * Toujours un nombre pair ; `[]` si rien à émettre.
 */
export function toToggleTimes(text: string, unitMs: number, repeat: number): number[] {
	const words = normalizeText(text).split(" ").filter(Boolean);
	if (words.length === 0) return [];
	const times: number[] = [];
	let t = 0; // en unités ; position de la prochaine bascule possible
	for (let r = 0; r < repeat; r++) {
		if (r > 0) t += GAP_WORD;
		words.forEach((word, w) => {
			if (w > 0) t += GAP_WORD;
			[...word].forEach((letter, l) => {
				if (l > 0) t += GAP_LETTER;
				[...MORSE[letter]].forEach((sign, s) => {
					if (s > 0) t += GAP_SIGN;
					times.push(t * unitMs);
					t += sign === "." ? DOT : DASH;
					times.push(t * unitMs);
				});
			});
		});
	}
	return times;
}
