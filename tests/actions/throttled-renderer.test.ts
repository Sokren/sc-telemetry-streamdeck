import { beforeEach, describe, expect, test } from "vitest";
import { ThrottledRenderer } from "../../src/actions/throttled-renderer.js";

let now: number;
let scheduled: { fn: () => void; at: number }[];
let sent: string[];
let current: string;
let renderer: ThrottledRenderer;

const compute = () => ({ payload: current, send: async () => void sent.push(current) });
const flush = () => new Promise((r) => setTimeout(r, 0));
async function advance(ms: number) {
	now += ms;
	const due = scheduled.filter((s) => s.at <= now);
	scheduled = scheduled.filter((s) => s.at > now);
	for (const s of due) s.fn();
	await flush();
}

beforeEach(() => {
	now = 1000;
	scheduled = [];
	sent = [];
	current = "A";
	renderer = new ThrottledRenderer({ now: () => now, schedule: (fn, ms) => void scheduled.push({ fn, at: now + ms }) });
});

describe("ThrottledRenderer", () => {
	test("premier rendu envoyé tout de suite", async () => {
		await renderer.request("k", compute);
		expect(sent).toEqual(["A"]);
	});

	test("même contenu → pas de renvoi", async () => {
		await renderer.request("k", compute);
		await advance(500);
		await renderer.request("k", compute);
		expect(sent).toEqual(["A"]);
	});

	test("deux changements en < 250 ms → un envoi différé du dernier état", async () => {
		await renderer.request("k", compute);
		await advance(100);
		current = "B";
		await renderer.request("k", compute);
		current = "C";
		await renderer.request("k", compute);
		expect(sent).toEqual(["A"]);
		await advance(150);
		expect(sent).toEqual(["A", "C"]);
	});

	test("force → envoi immédiat malgré la limite", async () => {
		await renderer.request("k", compute);
		current = "B";
		await renderer.request("k", compute, true);
		expect(sent).toEqual(["A", "B"]);
	});

	test("forget → l'envoi différé en attente est abandonné ; un nouveau rendu repart de zéro", async () => {
		await renderer.request("k", compute);
		current = "B";
		await renderer.request("k", compute);
		renderer.forget("k");
		await advance(300);
		expect(sent).toEqual(["A"]);
		current = "A";
		await renderer.request("k", compute);
		expect(sent).toEqual(["A", "A"]);
	});

	test("compute sans résultat (action disparue) → rien", async () => {
		await renderer.request("k", () => undefined);
		expect(sent).toEqual([]);
	});

	test("deux touches indépendantes", async () => {
		await renderer.request("k1", compute);
		await renderer.request("k2", compute);
		expect(sent).toEqual(["A", "A"]);
	});
});
