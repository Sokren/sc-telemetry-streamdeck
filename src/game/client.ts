import * as grpc from "@grpc/grpc-js";
import type protobuf from "protobufjs";
import { SERVICE, type GameSchema } from "./schema.js";
import type { GameAction, GameApi, TriggerResult } from "./types.js";

const STATUS_OK = "TRIGGER_GAME_ACTION_STATUS_OK";

/** Client unique de l'API locale du jeu (gRPC en clair, sans authentification). */
export class GameClient implements GameApi {
	readonly #client: grpc.Client;
	readonly #schema: GameSchema;

	constructor(schema: GameSchema, address = "127.0.0.1:2942") {
		this.#schema = schema;
		this.#client = new grpc.Client(address, grpc.credentials.createInsecure());
	}

	async listActions(timeoutMs: number): Promise<GameAction[]> {
		const res = await this.#call("ListTriggerableActions", {}, timeoutMs);
		const actions = (res.actions ?? []) as { action_name: string; category: string; holdable: boolean }[];
		return actions.map((a) => ({ name: a.action_name, category: a.category, holdable: a.holdable }));
	}

	async trigger(name: string, timeoutMs: number): Promise<TriggerResult> {
		try {
			const res = await this.#call("TriggerGameAction", { action_name: name }, timeoutMs);
			const status = res.status as string | number;
			if (status === STATUS_OK) return { ok: true };
			const reason = typeof status === "number" ? `STATUS_${status}` : status;
			return res.message ? { ok: false, reason, message: res.message as string } : { ok: false, reason };
		} catch (err) {
			const code = (err as grpc.ServiceError).code;
			const reason = typeof code === "number" ? (grpc.status[code] ?? `GRPC_${code}`) : "ERROR";
			return { ok: false, reason, message: (err as Error).message };
		}
	}

	close(): void {
		this.#client.close();
	}

	#call(rpc: string, request: object, timeoutMs: number): Promise<Record<string, unknown>> {
		const req: protobuf.Type = this.#schema.type(`${rpc}Request`);
		const res: protobuf.Type = this.#schema.type(`${rpc}Response`);
		return new Promise((resolve, reject) => {
			this.#client.makeUnaryRequest(
				`/${SERVICE}/${rpc}`,
				(o: object) => Buffer.from(req.encode(req.fromObject(o)).finish()),
				(b: Buffer) => res.toObject(res.decode(b), { enums: String, defaults: true }),
				request,
				{ deadline: Date.now() + timeoutMs },
				(err, value) => (err ? reject(err) : resolve(value as Record<string, unknown>)),
			);
		});
	}
}
