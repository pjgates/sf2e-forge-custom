/**
 * Pure Roll Logic (Functional Core)
 *
 * Stateless, pure functions for filtering roll targets and extracting
 * results from roll data. No Foundry API calls.
 */

import type { SaveResultData, DegreeOfSuccessString } from "./types.js";
import { invertDegreeString } from "./degree.js";

// ─── Target Filtering ────────────────────────────────────────────────────────

/** Minimal token data needed for filtering decisions. */
export interface TokenFilterData {
    id: string;
    uuid: string;
    hasActor: boolean;
    hasPlayerOwner: boolean;
    hasStatistic: boolean;
}

/**
 * Filter to NPC tokens that haven't rolled yet and have the required statistic.
 * Pure function — no Foundry access.
 */
export function filterUnrolledNpcTargets(
    tokens: TokenFilterData[],
    existingSaves: Record<string, unknown>,
): TokenFilterData[] {
    return tokens.filter(
        (t) => t.hasActor && !t.hasPlayerOwner && !existingSaves[t.id] && t.hasStatistic,
    );
}

/**
 * Filter active tokens to those in the target list that haven't rolled.
 * Pure function — no Foundry access.
 */
export function filterEligibleActiveTokens(
    activeTokens: Array<{ id: string; uuid: string }>,
    targetUUIDs: string[],
    existingSaves: Record<string, unknown>,
): Array<{ id: string; uuid: string }> {
    return activeTokens.filter(
        (t) => targetUUIDs.includes(t.uuid) && !existingSaves[t.id],
    );
}

/**
 * Filter to tokens that haven't been rolled yet.
 * Pure function for overcome "roll all" filtering.
 */
export function filterUnrolledTargets(
    tokens: Array<{ id: string; hasActor: boolean }>,
    existingSaves: Record<string, unknown>,
): Array<{ id: string; hasActor: boolean }> {
    return tokens.filter((t) => t.hasActor && !existingSaves[t.id]);
}

// ─── Roll Result Extraction ──────────────────────────────────────────────────

/** Raw data from a Foundry roll callback. */
export interface RollCallbackData {
    total: number;
    dieTotal: number;
    modifiers: Array<{ label: string; modifier: number; enabled: boolean }>;
    isPrivate: boolean;
}

/**
 * Build a SaveResultData from raw roll callback values.
 * Pure function — applies no Foundry logic.
 */
export function buildSaveResult(
    data: RollCallbackData,
    success: DegreeOfSuccessString,
    statistic: string,
): SaveResultData {
    const modifiers = data.modifiers
        .filter((m) => m.enabled)
        .map((m) => ({
            label: m.label ?? "Unknown",
            modifier: m.modifier ?? 0,
        }));

    return {
        value: data.total,
        die: data.dieTotal,
        success,
        modifiers,
        private: data.isPrivate,
        statistic,
    };
}

/**
 * Build a SaveResultData for an overcome roll (with degree inversion).
 * Pure function.
 */
export function buildOvercomeResult(
    data: RollCallbackData,
    pcDegree: DegreeOfSuccessString,
    statistic: string,
    npcSaveDC: number,
): SaveResultData {
    const base = buildSaveResult(data, pcDegree, statistic);

    // Invert: PC success → NPC failure on save
    const npcEffectiveDegree = invertDegreeString(pcDegree);

    return {
        ...base,
        success: npcEffectiveDegree,
        overcomeDc: npcSaveDC,
        overcomeSuccess: pcDegree,
    };
}

// ─── Statistic Selection ─────────────────────────────────────────────────────

/** Minimal statistic data for selection decisions. */
export interface StatisticCandidate {
    checkMod: number | null;
    hasRoll: boolean;
    /** Opaque reference back to the original Foundry statistic. */
    ref: unknown;
}

/**
 * Select the best statistic (highest check modifier) from candidates.
 * Pure function — just picks the best number.
 */
export function selectBestStatistic(
    candidates: StatisticCandidate[],
): StatisticCandidate | null {
    let best: StatisticCandidate | null = null;
    let bestMod = -Infinity;

    for (const c of candidates) {
        if (c.checkMod != null && c.checkMod > bestMod && c.hasRoll) {
            bestMod = c.checkMod;
            best = c;
        }
    }

    return best;
}
