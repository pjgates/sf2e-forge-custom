/**
 * PRAD (Players Roll All Dice) — Settings
 *
 * Registers and exposes the module setting that controls
 * the "Players Roll All Dice" variant rule.
 */

import { MODULE_ID } from "../constants.js";

const SETTING_KEY = "playersRollAllDice";

/**
 * Register the PRAD setting in Foundry's module configuration.
 * Called during the `init` hook.
 */
export function registerPradSettings(): void {
    game.settings!.register("sf2e-forge-custom", "playersRollAllDice", {
        name: "sf2e-forge-custom.settings.playersRollAllDice.name",
        hint: "sf2e-forge-custom.settings.playersRollAllDice.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true,
    });
}

/**
 * Check whether the PRAD variant rule is currently enabled.
 */
export function isPradEnabled(): boolean {
    return game.settings!.get("sf2e-forge-custom", "playersRollAllDice");
}
