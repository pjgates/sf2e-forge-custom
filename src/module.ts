/**
 * SF2e Forge Custom Rules
 * Main entry point for the Foundry VTT module.
 *
 * This module adds custom rules and homebrew modifications
 * to the Starfinder Second Edition system.
 */

import { onInit } from "./hooks/init.js";
import { onReady } from "./hooks/ready.js";

// Import styles so Vite bundles them into dist/module.css
import "../styles/module.scss";

const MODULE_ID = "sf2e-forge-custom";

// ─── Initialization ──────────────────────────────────────────────────────────

Hooks.once("init", () => {
    console.log(`${MODULE_ID} | Initializing SF2e Forge Custom Rules`);
    onInit();
});

Hooks.once("ready", () => {
    console.log(`${MODULE_ID} | SF2e Forge Custom Rules ready`);
    onReady();
});

export { MODULE_ID };
