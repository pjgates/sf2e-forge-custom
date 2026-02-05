/**
 * Called during the "ready" hook.
 * The game is fully loaded and all data is available at this point.
 */

import { MODULE_ID } from "../module.js";

export function onReady(): void {
    const isEnabled = game.settings.get(MODULE_ID, "enableCustomRules") as boolean;

    if (!isEnabled) {
        console.log(`${MODULE_ID} | Custom rules are disabled in settings.`);
        return;
    }

    // Apply custom rules here
    console.log(`${MODULE_ID} | Custom rules are active.`);
}
