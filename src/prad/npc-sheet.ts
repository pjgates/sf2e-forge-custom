/**
 * PRAD (Players Roll All Dice) — NPC Sheet Modifications
 *
 * Injects Attack DCs and Save DCs into the NPC sheet when
 * the PRAD variant rule is active. This gives the GM quick
 * reference for the DCs players will roll against.
 */

import { getAttackDC, getAttackModifierFromStrike, getSaveDC, getSaveModifier, toDC } from "./dc.js";
import { postAttackCard } from "./intercept-attack.js";
import { SAVE_TYPES } from "./types.js";
import type { SaveType } from "./types.js";
import { resolveHtmlRoot } from "../shared/html.js";

/**
 * Handle rendering of an NPC actor sheet.
 * Called by the unified sheet-hooks dispatcher when actor.type === "npc".
 * Injects DC badges next to saves and attacks.
 */
export function onRenderNpcSheet(
    sheet: Sf2eActorSheet,
    html: JQuery<HTMLElement> | HTMLElement,
    _data: object,
): void {
    const actor: Actor.Implementation | undefined = sheet.actor ?? sheet.document ?? sheet.object;
    if (!actor) return;

    // Only show to GM
    if (!game.user?.isGM) return;

    const root = resolveHtmlRoot(html);
    if (!root) return;

    injectSaveDCs(root, actor);
    injectAttackDCs(root, actor);
}

// ─── Save DC Labels ─────────────────────────────────────────────────────────

/**
 * Inject Save DC labels below each save modifier on the NPC sheet.
 * Leaves the original modifier input untouched (avoids Foundry data-binding
 * conflicts) and adds a small "DC XX" badge beneath it.
 */
function injectSaveDCs(root: HTMLElement, actor: Actor.Implementation): void {
    for (const saveType of SAVE_TYPES) {
        const saveMod = getSaveModifier(actor, saveType as SaveType);
        const saveDCValue = getSaveDC(saveMod);

        const selectors = [
            `[data-statistic="${saveType}"]`,
            `[data-slug="${saveType}"]`,
        ];

        for (const selector of selectors) {
            const elements = root.querySelectorAll<HTMLElement>(selector);
            for (const el of elements) {
                const container = el.closest("li") ?? el.parentElement;
                if (!container) continue;

                if (container.classList.contains("prad-modified")) continue;
                container.classList.add("prad-modified");

                // Create a small DC badge and append it to the container
                const dcBadge = document.createElement("div");
                dcBadge.className = "prad-save-dc-label";
                dcBadge.textContent = `DC ${saveDCValue}`;
                container.appendChild(dcBadge);
            }
        }
    }
}

// ─── Attack DC Replacement ───────────────────────────────────────────────────

/**
 * Replace attack modifiers on the NPC sheet with Attack DCs, and hijack
 * click handlers so clicking a DC triggers a player armor save roll
 * instead of the system's NPC attack roll dialog.
 */
function injectAttackDCs(root: HTMLElement, actor: Actor.Implementation): void {
    // Find strike items on the actor
    const allItems = actor.items.contents as Item.Implementation[];
    const strikes = allItems.filter(
        (i) => (i.type as string) === "melee" || (i.type as string) === "ranged" || (i.type as string) === "strike"
    );

    for (const strike of strikes) {
        const attackMod = getAttackModifierFromStrike(strike);
        const attackDCValue = getAttackDC(attackMod);
        const weaponName = strike.name ?? "Strike";

        // Try to find the strike's entry in the sheet by item ID
        const selectors = [
            `[data-item-id="${strike.id}"]`,
            `[data-entry-id="${strike.id}"]`,
        ];

        for (const selector of selectors) {
            const elements = root.querySelectorAll<HTMLElement>(selector);
            for (const el of elements) {
                if (el.classList.contains("prad-modified")) continue;
                el.classList.add("prad-modified");

                // Find strike buttons that show the attack modifier (e.g., "Strike +11")
                // and replace the text with DC values
                // SF2e uses data-action="strike-attack" for these buttons
                const strikeButtons = el.querySelectorAll<HTMLElement>('button[data-action="strike-attack"], button.attack-button');
                for (const btn of strikeButtons) {
                    const text = btn.textContent?.trim() ?? "";
                    let dc = attackDCValue;
                    
                    // Match "Strike +11" pattern (first attack)
                    const strikeMatch = text.match(/^Strike\s*([+-]?\d+)$/i);
                    if (strikeMatch) {
                        const mod = parseInt(strikeMatch[1], 10);
                        dc = toDC(mod);
                        btn.textContent = `DC ${dc}`;
                        btn.classList.add("prad-dc-button");
                    }
                    
                    // Match "+6 (MAP -5)" pattern (subsequent attacks)
                    const mapMatch = text.match(/^([+-]?\d+)\s*\(MAP\s*([+-]?\d+)\)/i);
                    if (mapMatch) {
                        const mod = parseInt(mapMatch[1], 10);
                        const mapPenalty = mapMatch[2]; // e.g., "-5"
                        dc = toDC(mod);
                        btn.textContent = `DC ${dc} (MAP ${mapPenalty})`;
                        btn.classList.add("prad-dc-button");
                    }

                    // Hijack the click: prevent the system's strike-attack handler,
                    // and instead trigger an armor save on the targeted PC.
                    const capturedDC = dc;
                    const capturedWeaponName = weaponName;
                    const capturedAttacker = actor;
                    const capturedWeaponItem = strike;

                    btn.addEventListener("click", (ev) => {
                        ev.preventDefault();
                        ev.stopImmediatePropagation();

                        onStrikeDCClick(capturedAttacker, capturedWeaponName, capturedDC, capturedWeaponItem);
                    }, { capture: true });
                }

                // Also look for modifier displays
                const modifierEls = el.querySelectorAll<HTMLElement>('.modifier, .attack-modifier, [data-modifier]');
                for (const modEl of modifierEls) {
                    modEl.textContent = `DC ${attackDCValue}`;
                    modEl.classList.add("prad-dc-value");
                }
            }
        }
    }
}

// ─── Strike DC Click Handler ─────────────────────────────────────────────────

/**
 * Handle a click on an NPC's Attack DC button.
 * Posts an attack card to chat with an "Armor Save" button for players to click.
 */
function onStrikeDCClick(
    attacker: Actor.Implementation,
    weaponName: string,
    attackDC: number,
    weaponItem?: Item.Implementation,
): void {
    postAttackCard({ attacker, weaponName, attackDC, weaponItem });
}
