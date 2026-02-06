/**
 * PRAD (Players Roll All Dice) — Party Sheet Modifications
 *
 * Replaces AC values with Armor Save modifiers on the Party sheet
 * so that members show their save modifier instead of raw AC.
 */

import { getArmorSaveModifier } from "./dc.js";
import { resolveHtmlRoot } from "../shared/html.js";

/**
 * Handle rendering of the Party sheet.
 * Called by the unified sheet-hooks dispatcher when actor.type === "party".
 * Replaces each member's AC value and label with their armor save modifier.
 */
export function onRenderPartySheet(
    _sheet: Sf2eActorSheet,
    html: JQuery<HTMLElement> | HTMLElement,
    _data: object,
): void {
    const root = resolveHtmlRoot(html);
    if (!root) return;

    injectMemberArmorSaves(root);
}

// ─── Member Armor Save Replacement ───────────────────────────────────────────

/**
 * Find every member's AC section on the party sheet and replace
 * the value with the armor save modifier and the label with "Arm".
 *
 * Party sheet DOM structure (per member):
 *   <section class="ac score">
 *       <label>AC</label>
 *       <span class="value">20</span>
 *   </section>
 */
function injectMemberArmorSaves(root: HTMLElement): void {
    const acSections = root.querySelectorAll<HTMLElement>("section.ac.score");

    for (const section of acSections) {
        // Skip if already modified
        if (section.classList.contains("prad-modified")) continue;

        const valueEl = section.querySelector<HTMLElement>("span.value");
        const labelEl = section.querySelector<HTMLElement>("label");

        if (!valueEl) continue;

        // Read the current AC value from the DOM
        const acValue = parseInt(valueEl.textContent?.trim() ?? "", 10);
        if (isNaN(acValue)) continue;

        // Convert to armor save modifier
        const armorSaveMod = getArmorSaveModifier(acValue);
        const modStr = armorSaveMod >= 0 ? `+${armorSaveMod}` : `${armorSaveMod}`;

        // Replace the value
        valueEl.textContent = modStr;
        valueEl.classList.add("prad-modified");

        // Replace the label
        if (labelEl) {
            labelEl.textContent = game.i18n!.localize(
                "sf2e-forge-custom.prad.armorLabelShort",
            );
            labelEl.classList.add("prad-modified");
        }

        // Mark the section as modified
        section.classList.add("prad-modified", "prad-armor-save");
    }
}
