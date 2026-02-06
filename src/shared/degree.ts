/**
 * Shared Degree-of-Success Logic
 *
 * Single source of truth for computing, inverting, and labelling
 * degrees of success. Used by both PRAD and Target Helper.
 */

import type { DegreeOfSuccessIndex, DegreeOfSuccessString } from "./types.js";
import { DEGREE_STRINGS, DEGREE_INDICES } from "./types.js";

// ─── Degree computation ──────────────────────────────────────────────────────

/**
 * Calculate the base degree of success from a d20 total vs a DC,
 * following PF2e/SF2e rules (including natural 1/20 adjustments).
 *
 * @param total     The total roll result (d20 + modifier)
 * @param dc        The DC being rolled against
 * @param dieValue  The natural d20 result (for nat-1/nat-20 adjustments)
 * @returns The degree of success index (0–3)
 */
export function calculateDegree(
    total: number,
    dc: number,
    dieValue: number,
): DegreeOfSuccessIndex {
    let degree: DegreeOfSuccessIndex;
    const delta = total - dc;

    if (delta >= 10) {
        degree = 3; // critical success
    } else if (delta >= 0) {
        degree = 2; // success
    } else if (delta <= -10) {
        degree = 0; // critical failure
    } else {
        degree = 1; // failure
    }

    // Natural 20: upgrade by one step
    if (dieValue === 20) {
        degree = Math.min(degree + 1, 3) as DegreeOfSuccessIndex;
    }

    // Natural 1: downgrade by one step
    if (dieValue === 1) {
        degree = Math.max(degree - 1, 0) as DegreeOfSuccessIndex;
    }

    return degree;
}

// ─── Inversion (index-based — single source of truth) ────────────────────────

/**
 * Invert a degree of success index.
 *   crit success (3) ↔ crit failure (0)
 *   success (2)       ↔ failure (1)
 */
export function invertDegreeIndex(degree: DegreeOfSuccessIndex): DegreeOfSuccessIndex {
    return (3 - degree) as DegreeOfSuccessIndex;
}

/**
 * Invert a degree of success string.
 * Delegates to `invertDegreeIndex` so inversion logic lives in one place.
 */
export function invertDegreeString(degree: DegreeOfSuccessString): DegreeOfSuccessString {
    return DEGREE_STRINGS[invertDegreeIndex(DEGREE_INDICES[degree])];
}

/**
 * Map degree for Overcome checks (Inversion 2).
 * Player succeeding means NPC fails their save — same as inversion.
 */
export function mapOvercomeDegree(degree: DegreeOfSuccessIndex): DegreeOfSuccessIndex {
    return invertDegreeIndex(degree);
}

// ─── Conversion helpers ──────────────────────────────────────────────────────

/**
 * Get the human-readable string for a degree of success index.
 */
export function degreeToString(degree: DegreeOfSuccessIndex): DegreeOfSuccessString {
    return DEGREE_STRINGS[degree];
}

/**
 * Get the numeric index for a degree of success string.
 */
export function degreeToIndex(degree: DegreeOfSuccessString): DegreeOfSuccessIndex {
    return DEGREE_INDICES[degree];
}
