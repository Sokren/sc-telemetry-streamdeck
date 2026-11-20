import fs from "node:fs";
import protobuf from "protobufjs";
import "protobufjs/ext/descriptor.js"; // ajoute Root.fromDescriptor

export const PACKAGE = "sc.game.telemetry.v1";
export const SERVICE = `${PACKAGE}.GameTelemetryService`;

/** Schéma de l'API, chargé à l'exécution depuis un FileDescriptorSet (`sc_extrait.desc`). */
export type GameSchema = {
	root: protobuf.Root;
	/** Type par nom court, ex. `type("TriggerGameActionRequest")`. */
	type(name: string): protobuf.Type;
};

export function loadSchema(descPath: string): GameSchema {
	const root = protobuf.Root.fromDescriptor(fs.readFileSync(descPath));
	return { root, type: (name) => root.lookupType(`${PACKAGE}.${name}`) };
}
