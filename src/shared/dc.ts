/**
 * Shared DC Derivation Utilities
 *
 * Pure functions to convert between modifiers and DCs, and to
 * extract modifiers from actor/item system data.
 * Used by both PRAD and Target Helper subsystems.
 */

import type { SaveType } from "./types.js";

// ─── Modifier ↔ DC conversions (pure) ────────────────────────────────────────

/**
 * Derive a DC from a modifier.
 * Formula: DC = 10 + modifier
 */
export function toDC(modifier: number): number {
    return 10 + modifier;
}

/** Alias for readability: Attack DC = 10 + attack modifier */
export const getAttackDC = toDC;

/** Alias for readability: Save DC = 10 + save modifier */
export const getSaveDC = toDC;

// ─── PC-side modifier derivation (pure) ──────────────────────────────────────

/**
 * Derive the player's armor save modifier from their AC.
 * Formula: AC modifier = AC - 10
 */
export function getArmorSaveModifier(ac: number): number {
    return ac - 10;
}

/**
 * Derive the player's overcome modifier from their spell DC.
 * Formula: Overcome modifier = spell DC - 10
 */
export function getOvercomeModifier(spellDC: number): number {
    return spellDC - 10;
}

// ─── Actor/Item data extractors (Foundry-coupled) ────────────────────────────

/**
 * Extract the attack modifier from an NPC's melee or ranged strike item.
 * SF2e stores this at `item.system.bonus.value`.
 */
export function getAttackModifierFromStrike(strikeItem: Item.Implementation): number {
    const sys = strikeItem.system as Sf2eStrikeSystemData;
    return sys?.bonus?.value ?? 0;
}

/**
 * Extract a save modifier from an NPC actor.
 * SF2e stores saves at `actor.system.saves[saveType].value`.
 * Falls back to the `getStatistic()` API if system data is missing.
 */
export function getNpcSaveModifier(actor: Actor.Implementation, saveType: SaveType | string): number {
    const sys = actor.system as Sf2eActorSystemData;
    const saveValue = sys?.saves?.[saveType]?.value;
    if (typeof saveValue === "number") return saveValue;

    // Try getStatistic API (works for both PCs and NPCs)
    const sf2eActor = actor as Sf2eActor;
    const stat = sf2eActor.getStatistic?.(saveType);
    if (stat?.check?.mod != null) return stat.check.mod;
    if (stat?.mod != null) return stat.mod;

    return 0;
}

/**
 * Get all three save DCs for an NPC, keyed by save type.
 */
export function getAllSaveDCs(
    actor: Actor.Implementation,
): Record<SaveType, number> {
    return {
        fortitude: getSaveDC(getNpcSaveModifier(actor, "fortitude")),
        reflex: getSaveDC(getNpcSaveModifier(actor, "reflex")),
        will: getSaveDC(getNpcSaveModifier(actor, "will")),
    };
}

/**
 * Read a PC's AC value from their system data.
 */
export function getPcAC(actor: Actor.Implementation): number {
    const sys = actor.system as Sf2eActorSystemData;
    return sys?.attributes?.ac?.value ?? 10;
}

/**
 * Attempt to read a PC's primary spellcasting DC.
 * Looks for the highest class DC or spellcasting entry DC.
 */
export function getPcSpellDC(actor: Actor.Implementation): number {
    const sys = actor.system as Sf2eActorSystemData;

    // Try class DC first (common in PF2e/SF2e)
    const classDC = sys?.attributes?.classDC?.value;
    if (typeof classDC === "number") return classDC;

    // Try spellcasting entries
    const allItems = actor.items.contents as Item.Implementation[];
    const spellcastingEntries = allItems.filter(
        (i) => (i.type as string) === "spellcastingEntry",
    );
    if (spellcastingEntries.length > 0) {
        let best = 0;
        for (const entry of spellcastingEntries) {
            const entrySys = entry.system as Sf2eSpellcastingEntrySystemData;
            const dc = entrySys?.spelldc?.dc ?? entrySys?.dc?.value ?? 0;
            if (dc > best) best = dc;
        }
        if (best > 0) return best;
    }

    // Fallback: use class DC from statistics if available
    const sf2eActor = actor as Sf2eActor;
    const stat =
        sf2eActor.getStatistic?.("class-dc") ??
        sf2eActor.getStatistic?.("classDC");
    if (stat?.dc) return stat.dc.value;

    return 10; // ultimate fallback
}
