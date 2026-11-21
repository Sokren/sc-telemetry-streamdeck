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
	/** Frames diffusées par TelemetryStream (objets au format du schéma), puis fin du flux. */
	frames?: object[];
	/** Garder le flux ouvert après les frames (pour tester l'annulation). */
	holdOpen?: boolean;
	/** Terminer le flux par une erreur gRPC au lieu d'une fin normale. */
	streamError?: boolean;
	/** Jeu 4.10 : seulement le flux de télémétrie, sans les commandes d'actions (arrivées en 5.0). */
	legacy?: boolean;
};

function method(name: string, req: string, res: string, responseStream = false) {
	const reqType = t(req);
	const resType = t(res);
	return {
		path: `/${P}GameTelemetryService/${name}`,
		requestStream: false,
		responseStream,
		requestSerialize: (o: object) => Buffer.from(reqType.encode(reqType.fromObject(o)).finish()),
		requestDeserialize: (b: Buffer) => reqType.toObject(reqType.decode(b)),
		responseSerialize: (o: object) => Buffer.from(resType.encode(resType.fromObject(o)).finish()),
		responseDeserialize: (b: Buffer) => resType.toObject(resType.decode(b)),
	};
}

export async function startFakeGame(h: FakeHandlers): Promise<{ port: number; stop(): Promise<void> }> {
	const server = new grpc.Server();
	const definition: Record<string, ReturnType<typeof method>> = {
		TelemetryStream: method("TelemetryStream", "TelemetryStreamRequest", "TelemetryStreamResponse", true),
	};
	const implementation: grpc.UntypedServiceImplementation = {
		TelemetryStream: (call: grpc.ServerWritableStream<object, object>) => {
			for (const f of h.frames ?? []) call.write(f);
			if (h.streamError) call.emit("error", { code: grpc.status.INTERNAL, details: "erreur simulée" });
			else if (!h.holdOpen) call.end();
		},
	};
	if (!h.legacy) {
		definition.ListTriggerableActions = method("ListTriggerableActions", "ListTriggerableActionsRequest", "ListTriggerableActionsResponse");
		definition.TriggerGameAction = method("TriggerGameAction", "TriggerGameActionRequest", "TriggerGameActionResponse");
		implementation.ListTriggerableActions = (_call: grpc.ServerUnaryCall<object, object>, cb: grpc.sendUnaryData<object>) =>
			cb(null, { actions: h.actions ?? [] });
		implementation.TriggerGameAction = (call: grpc.ServerUnaryCall<TriggerRequest, object>, cb: grpc.sendUnaryData<object>) =>
			cb(null, h.trigger?.(call.request) ?? { status: 1 });
	}
	server.addService(definition as grpc.ServiceDefinition, implementation);
	const port = await new Promise<number>((resolve, reject) =>
		server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, p) => (err ? reject(err) : resolve(p))),
	);
	return {
		port,
		stop: async () => server.forceShutdown(),
	};
}
