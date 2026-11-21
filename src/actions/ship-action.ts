import { action } from "@elgato/streamdeck";
import { ShipCommandAction } from "./ship-command-action.js";

/** Commandes vaisseau et siège sans état (prêt au vol, ATC, ping, quantum, modes du siège…). */
@action({ UUID: "com.sokren.sc-telemetry.ship-action" })
export class ShipAction extends ShipCommandAction {}
