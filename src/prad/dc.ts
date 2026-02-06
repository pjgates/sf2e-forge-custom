/**
 * PRAD (Players Roll All Dice) — DC Derivation
 *
 * Re-exports shared DC utilities. PRAD-specific consumers can
 * import from here without knowing about the shared layer.
 */

// Re-export everything from shared/dc.ts
export {
    toDC,
    getAttackDC,
    getSaveDC,
    getArmorSaveModifier,
    getOvercomeModifier,
    getAttackModifierFromStrike,
    getNpcSaveModifier as getSaveModifier,
    getAllSaveDCs,
    getPcAC,
    getPcSpellDC,
} from "../shared/dc.js";
