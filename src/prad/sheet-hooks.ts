/**
 * PRAD (Players Roll All Dice) — Unified Sheet Hook Dispatcher
 *
 * Registers a single `renderActorSheet` hook that dispatches to
 * NPC or PC sheet augmentation based on actor type. This halves
 * the hook overhead and provides a single entry point.
 */

import { MODULE_ID } from "../constants.js";
import { onRenderNpcSheet } from "./npc-sheet.js";
import { onRenderPcSheet } from "./pc-sheet.js";

/**
 * Register a single unified `renderActorSheet` hook for all PRAD
 * sheet augmentations.
 */
export function registerPradSheetHooks(): void {
    Hooks.on("renderActorSheet", onRenderActorSheet);
    console.log(`${MODULE_ID} | PRAD: Unified sheet augmentation hook registered`);
}

/**
 * Unified hook handler — dispatches by actor type.
 */
function onRenderActorSheet(
    sheet: object,
    html: JQuery<HTMLElement>,
    data: object,
): void {
    try {
        const s = sheet as Sf2eActorSheet;
        const actor = s.actor ?? s.document ?? s.object;
        if (!actor) return;

        const actorType = actor.type as string;
        if (actorType === "npc") {
            onRenderNpcSheet(s, html, data);
        } else if (actorType === "character") {
            onRenderPcSheet(s, html, data);
        }
    } catch (err) {
        console.error(`${MODULE_ID} | PRAD: Error in renderActorSheet hook`, err);
    }
}
