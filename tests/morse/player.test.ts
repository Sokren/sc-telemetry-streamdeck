import { describe, expect, test } from "vitest";
import { MorsePlayer } from "../../src/morse/player.js";

/** Horloge simulée : `wait` avance le temps instantanément, sauf si on l'interrompt. */
function harness(opts: { failAt?: number; stopAfterToggles?: number } = {}) {
	let t = 0;
	const toggledAt: number[] = [];
	let player!: MorsePlayer;
	const toggle = async () => {
		if (opts.failAt !== undefined && toggledAt.length === opts.failAt) return false;
		toggledAt.push(t);
		if (opts.stopAfterToggles !== undefined && toggledAt.length === opts.stopAfterToggles) player.stop();
		return true;
	};
	const wait = async (ms: number, signal: AbortSignal) => {
		if (!signal.aborted) t += ms;
	};
	player = new MorsePlayer(toggle, wait, () => t);
	return { player, toggledAt };
}

describe("MorsePlayer", () => {
	test("bascule à chaque instant prévu puis « done »", async () => {
		const { player, toggledAt } = harness();
		expect(await player.play([0, 100, 200, 300])).toBe("done");
		expect(toggledAt).toEqual([0, 100, 200, 300]);
	});

	test("playing vrai pendant l'émission, faux après", async () => {
		const { player } = harness();
		const run = player.play([0, 100]);
		expect(player.playing).toBe(true);
		await run;
		expect(player.playing).toBe(false);
	});

	test("arrêt torche allumée → « stopped » et une seule bascule de remise", async () => {
		const { player, toggledAt } = harness({ stopAfterToggles: 1 });
		expect(await player.play([0, 100, 200, 300])).toBe("stopped");
		expect(toggledAt).toHaveLength(2); // allumage + remise
	});

	test("arrêt torche éteinte → aucune remise", async () => {
		const { player, toggledAt } = harness({ stopAfterToggles: 2 });
		expect(await player.play([0, 100, 200, 300])).toBe("stopped");
		expect(toggledAt).toHaveLength(2);
	});

	test("bascule en échec torche allumée → « failed », remise, rien d'autre", async () => {
		const { player, toggledAt } = harness({ failAt: 1 }); // l'extinction échoue
		expect(await player.play([0, 100, 200, 300])).toBe("failed");
		// allumage réussi ; extinction prévue échouée ; une tentative de remise (échoue aussi : failAt reste 1)
		expect(toggledAt).toEqual([0]);
	});

	test("bascule en échec torche éteinte → « failed », aucune bascule de plus", async () => {
		const { player, toggledAt } = harness({ failAt: 0 });
		expect(await player.play([0, 100, 200, 300])).toBe("failed");
		expect(toggledAt).toEqual([]);
	});

	test("stop() sans émission en cours → sans effet", () => {
		const { player } = harness();
		expect(() => player.stop()).not.toThrow();
		expect(player.playing).toBe(false);
	});
});
