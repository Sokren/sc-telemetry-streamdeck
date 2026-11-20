import { action } from "@elgato/streamdeck";
import { ShipToggleAction } from "./ship-toggle-action.js";

@action({ UUID: "com.sokren.sc-telemetry.ship-toggle" })
export class ShipToggleRegistered extends ShipToggleAction {}
