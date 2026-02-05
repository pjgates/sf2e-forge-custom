/**
 * Called during the "init" hook.
 * Use this to register custom settings, document classes, and other
 * elements that need to be available before the game is ready.
 */

import { MODULE_ID } from "../module.js";

export function onInit(): void {
    // Register module settings
    registerSettings();

    // Register any custom Handlebar helpers or partials here
}

/**
 * Register module settings that appear in Foundry's module configuration.
 */
function registerSettings(): void {
    game.settings.register(MODULE_ID, "enableCustomRules", {
        name: "Enable Custom Rules",
        hint: "Toggle all custom rules provided by this module on or off.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });
}
