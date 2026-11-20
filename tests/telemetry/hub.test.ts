import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TelemetryFrame } from "../../src/game/types.js";
import { TelemetryHub } from "../../src/telemetry/hub.js";

/** Faux jeu : chaque ouverture de flux est enregistrée et pilotable. */
class FakeStreams {
	opened: { onFrame: (f: TelemetryFrame) => void; onEnd: (e?: Error) => void; cancelled: boolean }[] = [];
	openStream(onFrame: (f: TelemetryFrame) => void, onEnd: (e?: Error) => void) {
		const s = { onFrame, onEnd, cancelled: false };
		this.opened.push(s);
		return { cancel: () => void (s.cancelled = true) };
	}
	get last() {
		return this.opened[this.opened.length - 1];
	}
}

let game: FakeStreams;
let hub: TelemetryHub;

beforeEach(() => {
	vi.useFakeTimers();
	game = new FakeStreams();
	hub = new TelemetryHub(game);
});
afterEach(() => vi.useRealTimers());

describe("TelemetryHub — ouverture et partage", () => {
	test("pas de flux sans abonné", () => {
		expect(game.opened).toHaveLength(0);
	});

	test("ouvert au premier abonné, un seul flux pour deux abonnés", () => {
		hub.subscribe(() => {});
		hub.subscribe(() => {});
		expect(game.opened).toHaveLength(1);
	});

	test("dernier désabonnement → flux annulé, plus de réouverture", () => {
		const a = hub.subscribe(() => {});
		const b = hub.subscribe(() => {});
		a();
		expect(game.last.cancelled).toBe(false);
		b();
		expect(game.last.cancelled).toBe(true);
		vi.advanceTimersByTime(20_000);
		expect(game.opened).toHaveLength(1);
	});

	test("réabonnement après fermeture → nouveau flux", () => {
		hub.subscribe(() => {})();
		hub.subscribe(() => {});
		expect(game.opened).toHaveLength(2);
	});
});

describe("TelemetryHub — sections", () => {
	test("frame → section disponible et abonnés notifiés", () => {
		const listener = vi.fn();
		hub.subscribe(listener);
		game.last.onFrame({ actor: { vitals: {} } });
		expect(hub.section("actor")).toEqual({ vitals: {} });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	test("frame partielle : une autre section ne remplace pas actor", () => {
		hub.subscribe(() => {});
		game.last.onFrame({ actor: { a: 1 } });
		game.last.onFrame({ vehicle: { v: 1 } });
		expect(hub.section("actor")).toEqual({ a: 1 });
		expect(hub.section("vehicle")).toEqual({ v: 1 });
	});

	test("section périmée après 3000 ms → undefined, abonnés notifiés sans nouvelle frame", () => {
		const listener = vi.fn();
		hub.subscribe(listener);
		game.last.onFrame({ actor: { a: 1 } });
		listener.mockClear();
		vi.advanceTimersByTime(2900);
		expect(hub.section("actor")).toEqual({ a: 1 });
		expect(listener).not.toHaveBeenCalled();
		vi.advanceTimersByTime(700);
		expect(hub.section("actor")).toBeUndefined();
		expect(listener).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(5000);
		expect(listener).toHaveBeenCalledTimes(1); // une seule notification de péremption
	});
});

describe("TelemetryHub — reconnexion", () => {
	test("fin du flux → réouverture après 1000, 2000, 4000, 5000, 5000 ms", () => {
		hub.subscribe(() => {});
		const delays = [1000, 2000, 4000, 5000, 5000];
		for (const [i, d] of delays.entries()) {
			game.last.onEnd(new Error("UNAVAILABLE"));
			vi.advanceTimersByTime(d - 1);
			expect(game.opened).toHaveLength(i + 1);
			vi.advanceTimersByTime(1);
			expect(game.opened).toHaveLength(i + 2);
		}
	});

	test("une frame reçue remet l'attente à 1000 ms", () => {
		hub.subscribe(() => {});
		game.last.onEnd(new Error());
		vi.advanceTimersByTime(1000);
		game.last.onEnd(new Error());
		vi.advanceTimersByTime(2000);
		game.last.onFrame({ actor: {} });
		game.last.onEnd();
		vi.advanceTimersByTime(1000);
		expect(game.opened).toHaveLength(4);
	});

	test("flux ouvert mais muet pendant 10 s (perso pas encore apparu) → annulé puis rouvert", () => {
		hub.subscribe(() => {});
		vi.advanceTimersByTime(9500);
		expect(game.last.cancelled).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(game.opened[0].cancelled).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(game.opened).toHaveLength(2);
	});

	test("flux qui envoie des frames → jamais coupé pour silence", () => {
		hub.subscribe(() => {});
		for (let i = 0; i < 30; i++) {
			game.last.onFrame({ actor: {} });
			vi.advanceTimersByTime(1000);
		}
		expect(game.opened).toHaveLength(1);
		expect(game.last.cancelled).toBe(false);
	});

	test("désabonnement pendant l'attente → pas de réouverture", () => {
		const off = hub.subscribe(() => {});
		game.last.onEnd(new Error());
		off();
		vi.advanceTimersByTime(10_000);
		expect(game.opened).toHaveLength(1);
	});
});
