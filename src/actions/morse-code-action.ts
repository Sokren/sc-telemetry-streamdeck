import { action } from "@elgato/streamdeck";
import { MorseAction } from "./morse-action.js";

@action({ UUID: "com.sokren.sc-telemetry.morse-code" })
export class MorseCodeAction extends MorseAction {}
