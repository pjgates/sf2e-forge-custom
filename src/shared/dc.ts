/**
 * Shared DC Derivation Utilities
 *
 * Pure functions to convert between modifiers and DCs, and to
 * extract modifiers from actor/item system data.
 * Used by both PRAD and Target Helper subsystems.
 *
 * ## DC Base: +11 (default) vs +12 (strict)
 *
 * When converting a monster's roll into a player-facing DC (the core of
 * "Players Roll All Dice"), the formula is:
 *
 *     DC = BASE + modifier
 *
 * **Why not +10?**
 * In PF2e, "ties go to the roller." In normal play the monster rolls and
 * wins ties; in PRAD the player rolls and wins ties. Using +10 gives the
 * player *both* the tie benefit AND removes it from the monster — a 10%
 * (2-step) swing in the player's favour on every attack.
 *
 * **+11 (default — community standard)**
 * The d20 average is 10.5; rounding up yields 11. This splits the tie
 * benefit between attacker and defender, leaving only a 5% (1-step)
 * residual player bias. This is the value recommended by the PF2e
 * community and Gamemastery Guide variant-rule discussions.
 *
 * **+12 (strict — exact probability preservation)**
 * Using +12 exactly reproduces the original hit / miss / crit-hit /
 * crit-miss probabilities.  The trade-off is that ties on the player's
 * defense roll now count *against* them, which can feel inconsistent
 * with every other roll they make in PF2e.
 *
 * ### Proof (concrete example)
 *
 * Monster +5 attack vs AC 15 (defense mod = AC − 10 = +5):
 *
 * | Formula | Player defends when… | P(hit) | Original P(hit) |
 * |---------|----------------------|--------|-----------------|
 * | +10     | d20 ≥ 10             | 45%    | 55% ← 10% off  |
 * | +11     | d20 ≥ 11             | 50%    | 55% ←  5% off  |
 * | +12     | d20 ≥ 12             | 55%    | 55% ✓ exact     |
 */

import type { SaveType } from "./types.js";

// ─── DC Base Configuration ───────────────────────────────────────────────────

/**
 * Default DC base: uses the d20 average (10.5 → 11).
 * Gives a small (5%) probability bias favouring the player.
 */
export const DC_BASE_DEFAULT = 11;

/**
 * Strict DC base: exactly preserves original roll probabilities.
 * Fully compensates for the "ties go to the roller" inversion.
 */
export const DC_BASE_STRICT = 12;

/** Module-level DC base — set once during the `ready` hook. */
let _dcBase: number = DC_BASE_DEFAULT;

/**
 * Set the DC base for all modifier → DC conversions.
 * Call this during initialization based on the user's setting.
 */
export function setDCBase(base: number): void {
    _dcBase = base;
}

/** Return the current DC base (11 or 12). */
export function getDCBase(): number {
    return _dcBase;
}

// ─── Modifier ↔ DC conversions ───────────────────────────────────────────────

/**
 * Derive a DC from a modifier.
 * Formula: DC = dcBase + modifier  (dcBase is 11 by default, 12 in strict mode)
 */
export function toDC(modifier: number): number {
    return _dcBase + modifier;
}

/** Alias for readability: Attack DC = dcBase + attack modifier */
export const getAttackDC = toDC;

/** Alias for readability: Save DC = dcBase + save modifier */
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
