// Faux serveur du jeu pour les tests : sert l'API à partir du vrai schéma extrait.
import fs from "node:fs";
import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import "protobufjs/ext/descriptor.js";

export const DESC_PATH = new URL("../../schema/sc_extrait.desc", import.meta.url);
const P = "sc.game.telemetry.v1.";

const root = protobuf.Root.fromDescriptor(fs.readFileSync(DESC_PATH));
const t = (name: string) => root.lookupType(P + name);

export type TriggerRequest = { action_name: string; hold_ms?: number };

export type FakeHandlers = {
	actions?: { action_name: string; category: string; holdable?: boolean }[];
	/** Réponse à TriggerGameAction ; reçoit la requête décodée. Par défaut : status OK (1). */
	trigger?: (req: TriggerRequest) => { status: number; message?: string };
};

function method(name: string, req: string, res: string) {
	const reqType = t(req);
	const resType = t(res);
	return {
		path: `/${P}GameTelemetryService/${name}`,
		requestStream: false,
		responseStream: false,
		requestSerialize: (o: object) => Buffer.from(reqType.encode(reqType.fromObject(o)).finish()),
		requestDeserialize: (b: Buffer) => reqType.toObject(reqType.decode(b)),
		responseSerialize: (o: object) => Buffer.from(resType.encode(resType.fromObject(o)).finish()),
		responseDeserialize: (b: Buffer) => resType.toObject(resType.decode(b)),
	};
}

export async function startFakeGame(h: FakeHandlers): Promise<{ port: number; stop(): Promise<void> }> {
	const server = new grpc.Server();
	server.addService(
		{
			ListTriggerableActions: method("ListTriggerableActions", "ListTriggerableActionsRequest", "ListTriggerableActionsResponse"),
			TriggerGameAction: method("TriggerGameAction", "TriggerGameActionRequest", "TriggerGameActionResponse"),
		},
		{
			ListTriggerableActions: (_call: grpc.ServerUnaryCall<object, object>, cb: grpc.sendUnaryData<object>) =>
				cb(null, { actions: h.actions ?? [] }),
			TriggerGameAction: (call: grpc.ServerUnaryCall<TriggerRequest, object>, cb: grpc.sendUnaryData<object>) =>
				cb(null, h.trigger?.(call.request) ?? { status: 1 }),
		},
	);
	const port = await new Promise<number>((resolve, reject) =>
		server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, p) => (err ? reject(err) : resolve(p))),
	);
	return {
		port,
		stop: () => new Promise<void>((resolve) => server.tryShutdown(() => resolve())),
	};
}
