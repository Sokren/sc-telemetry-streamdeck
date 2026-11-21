/** Changement de vue automatique (autoswitch.js). */
export type AutoSettings = { enabled: boolean; on_foot: string; seated: string; eva: string };

export declare const POSITIONS: readonly ["on_foot", "seated", "eva"];

export declare const DEFAULTS: { on_foot: string; seated: string; eva: string };

export declare function parseAutoSettings(raw: string | null): AutoSettings;

export declare function createAutoSwitch(o: {
	getSettings: () => AutoSettings;
	viewExists: (id: string) => boolean;
	isEditing: () => boolean;
	apply: (id: string) => void;
	skipInitial?: boolean;
	delayMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: never) => void;
}): { update(position: string): void; retry(): void; settingsChanged(): void; userNavigated(): void };
