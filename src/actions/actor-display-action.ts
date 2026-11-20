import { action } from "@elgato/streamdeck";
import { DisplayAction } from "./display-action.js";

@action({ UUID: "com.sokren.sc-telemetry.actor-display" })
export class ActorDisplayAction extends DisplayAction {}
