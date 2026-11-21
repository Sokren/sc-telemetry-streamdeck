import type { Route } from "../http.js";
import { MorseControl, type MorseRequest } from "../morse-control.js";

export function morseRoutes(deps: { morse: MorseControl }): Route[] {
	return [
		{
			method: "POST",
			path: "/api/v1/morse",
			handle: async ({ body }) => {
				const request = (body && typeof body === "object" ? body : {}) as MorseRequest;
				const result = deps.morse.start(request);
				if (result === "busy") return { status: 409, json: { error: "already_playing" } };
				if (result === "empty") return { status: 422, json: { error: "nothing_to_send" } };
				return { status: 202, json: MorseControl.settings(request) };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/morse",
			handle: async () => (deps.morse.stop() ? { status: 204 } : { status: 404, json: { error: "not_playing" } }),
		},
	];
}
