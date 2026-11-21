import { action } from "@elgato/streamdeck";
import { ShipDisplay } from "./ship-display.js";

@action({ UUID: "com.sokren.sc-telemetry.ship-display" })
export class ShipDisplayAction extends ShipDisplay {}
