/**
 * Target Helper — Save Rolling (Imperative Shell)
 *
 * Handles rolling saves for targets using the system's native
 * Statistic.check.roll() API with createMessage: false.
 * Results are captured via callback and stored in message flags.
 *
 * Filtering and result-building logic is delegated to pure functions
 * in shared/roll-logic.ts.
 *
 * Ported from PF2e Toolbelt's Target Helper save.ts.
 */

import { MODULE_ID } from "../constants.js";
import { getNpcSaveModifier, getSaveDC } from "../shared/dc.js";
import {
    filterUnrolledNpcTargets,
    filterEligibleActiveTokens,
    filterUnrolledTargets,
    buildSaveResult,
    buildOvercomeResult,
    selectBestStatistic,
    type RollCallbackData,
    type TokenFilterData,
    type StatisticCandidate,
} from "../shared/roll-logic.js";
import { getFlagData } from "./flags.js";
import { sendSaveUpdate } from "./socket.js";
import { type SaveResultData, type DegreeOfSuccessString } from "./types.js";

// ─── Roll Callback Helpers ───────────────────────────────────────────────────

/**
 * Extract raw data from a Foundry roll callback for the pure builder.
 */
function extractRollCallbackData(roll: Roll, msg: ChatMessage.Implementation | null): RollCallbackData {
    const dieTerm = roll.terms?.[0] as Sf2eRollDieTerm | undefined;
    const dieTotal: number = dieTerm?.total ?? dieTerm?.results?.[0]?.result ?? 0;

    const msgFlags = msg?.flags as Sf2eMessageFlags | undefined;
    const systemFlags = (msgFlags?.sf2e ?? msgFlags?.pf2e) as Sf2eSystemFlags | undefined;
    const rawModifiers = systemFlags?.modifiers ?? [];

    const isPrivate = msg?.whisper?.some?.(
        (userId) => (game as Sf2eGame).users?.get(String(userId))?.isGM ?? false,
    ) ?? false;

    return {
        total: roll.total ?? 0,
        dieTotal,
        modifiers: rawModifiers.map((m) => ({
            label: m.label ?? "Unknown",
            modifier: m.modifier ?? 0,
            enabled: !!m.enabled,
        })),
        isPrivate,
    };
}

// ─── Save Rolling ────────────────────────────────────────────────────────────

/**
 * Roll saves for the given targets against a message's save DC.
 */
export async function rollSavesForTargets(
    event: MouseEvent,
    message: ChatMessage.Implementation,
    targets: Sf2eTokenDocument[],
): Promise<void> {
    const flagData = getFlagData(message);
    if (!flagData?.save) return;

    const { statistic: saveStatistic, dc } = flagData.save;
    const existingSaves = flagData.saves ?? {};

    const origin = (message as Sf2eChatMessage).actor ?? null;
    const skipDialog = targets.length > 1;
    const updates: Record<string, SaveResultData> = {};

    const rollPromises = targets.map((target) => {
        if (existingSaves[target.id]) return;

        const actor = target.actor;
        if (!actor) return;

        const statistic = actor.getStatistic?.(saveStatistic);
        if (!statistic?.check?.roll) return;

        return new Promise<void>((resolve) => {
            const callback: Sf2eRollCallback = (roll, success, msg) => {
                try {
                    const data = extractRollCallbackData(roll, msg);
                    updates[target.id] = buildSaveResult(
                        data,
                        success as DegreeOfSuccessString,
                        saveStatistic,
                    );
                } catch (err) {
                    console.error(`${MODULE_ID} | Target Helper: Error processing save roll`, err);
                }
                resolve();
            };

            statistic.check!.roll({
                dc: { value: dc },
                origin,
                skipDialog,
                createMessage: false,
                callback,
            });
        });
    });

    const filtered = rollPromises.filter(Boolean);
    if (!filtered.length) return;
    await Promise.all(filtered);

    if (Object.keys(updates).length > 0) {
        await sendSaveUpdate(message, updates);
    }
}

/**
 * Roll saves for all NPC targets that haven't rolled yet.
 * Only callable by the GM.
 */
export async function rollNpcSaves(
    event: MouseEvent,
    message: ChatMessage.Implementation,
): Promise<void> {
    if (!game.user?.isGM) return;

    const flagData = getFlagData(message);
    if (!flagData?.save) return;

    const existingSaves = flagData.saves ?? {};
    const saveStatistic = flagData.save.statistic;

    // Resolve tokens into plain data for the pure filter
    const tokenData: Array<{ token: Sf2eTokenDocument; filterData: TokenFilterData }> = [];
    for (const uuid of flagData.targets) {
        const token = fromUuidSync(uuid) as Sf2eTokenDocument | null;
        if (!token?.actor) continue;
        tokenData.push({
            token,
            filterData: {
                id: token.id,
                uuid,
                hasActor: true,
                hasPlayerOwner: token.actor.hasPlayerOwner ?? false,
                hasStatistic: !!token.actor.getStatistic?.(saveStatistic),
            },
        });
    }

    // Pure filter
    const eligibleFilterData = filterUnrolledNpcTargets(
        tokenData.map((t) => t.filterData),
        existingSaves,
    );

    // Resolve back to Foundry tokens
    const eligibleIds = new Set(eligibleFilterData.map((t) => t.id));
    const npcTargets = tokenData
        .filter((t) => eligibleIds.has(t.filterData.id))
        .map((t) => t.token);

    if (npcTargets.length === 0) return;

    await rollSavesForTargets(event, message, npcTargets);
}

/**
 * Roll a save for the current user's selected/active tokens.
 * Filters to tokens that are in the message's target list and haven't rolled.
 */
export async function rollSaveForActiveTokens(
    event: MouseEvent,
    message: ChatMessage.Implementation,
): Promise<void> {
    const flagData = getFlagData(message);
    if (!flagData?.save) return;

    const existingSaves = flagData.saves ?? {};
    const targetUUIDs = flagData.targets;

    const sf2eG = game as Sf2eGame;
    const activeTokens: Sf2eActiveToken[] = sf2eG.user?.getActiveTokens?.() ?? [];

    // Map to plain data for the pure filter
    const tokenUUIDData = activeTokens.map((t) => ({
        id: t.id ?? t.document?.id ?? "",
        uuid: t.document?.uuid ?? t.uuid ?? "",
        raw: t,
    }));

    const eligible = filterEligibleActiveTokens(tokenUUIDData, targetUUIDs, existingSaves);

    if (eligible.length === 0) {
        if (activeTokens.length > 0) {
            ui.notifications!.info(game.i18n!.localize("sf2e-forge-custom.targetHelper.notInTargetList"));
        }
        return;
    }

    // Resolve back to Foundry tokens
    const eligibleIds = new Set(eligible.map((t) => t.id));
    const eligibleTargets = activeTokens
        .filter((t) => eligibleIds.has(t.id ?? t.document?.id ?? ""))
        .map((t) => t.document ?? t) as Sf2eTokenDocument[];

    await rollSavesForTargets(event, message, eligibleTargets);
}

// ─── PRAD Overcome Rolling ───────────────────────────────────────────────────

/**
 * Roll an Overcome Check for the caster against one or more NPC targets.
 */
export async function rollOvercomeForTargets(
    _event: MouseEvent,
    message: ChatMessage.Implementation,
    targets: Sf2eTokenDocument[],
): Promise<void> {
    const flagData = getFlagData(message);
    if (!flagData?.save) return;

    const { statistic: saveStatistic } = flagData.save;
    const existingSaves = flagData.saves ?? {};

    const casterActor: Sf2eActor | null = flagData.author
        ? (fromUuidSync(flagData.author) as Sf2eActor | null)
        : (message as Sf2eChatMessage).actor ?? null;
    if (!casterActor) {
        console.warn(`${MODULE_ID} | PRAD Overcome: Cannot resolve caster actor`);
        return;
    }

    const casterStatistic = findBestOvercomeStatistic(casterActor);
    if (!casterStatistic?.check?.roll) {
        console.warn(`${MODULE_ID} | PRAD Overcome: No rollable statistic found for caster`);
        ui.notifications!.warn(game.i18n!.localize("sf2e-forge-custom.prad.noOvercomeStatistic"));
        return;
    }

    const skipDialog = targets.length > 1;
    const updates: Record<string, SaveResultData> = {};

    const rollPromises = targets.map((target) => {
        if (existingSaves[target.id]) return;

        const npcActor = target.actor;
        if (!npcActor) return;

        const npcSaveMod = getNpcSaveModifier(npcActor, saveStatistic);
        const npcSaveDC = getSaveDC(npcSaveMod);

        return new Promise<void>((resolve) => {
            const callback: Sf2eRollCallback = (roll, success, msg) => {
                try {
                    const data = extractRollCallbackData(roll, msg);
                    updates[target.id] = buildOvercomeResult(
                        data,
                        success as DegreeOfSuccessString,
                        saveStatistic,
                        npcSaveDC,
                    );
                } catch (err) {
                    console.error(`${MODULE_ID} | PRAD Overcome: Error processing roll`, err);
                }
                resolve();
            };

            casterStatistic.check!.roll({
                dc: { value: npcSaveDC, label: `${npcActor.name}: ${saveStatistic}` },
                skipDialog,
                createMessage: false,
                callback,
            });
        });
    });

    const filtered = rollPromises.filter(Boolean);
    if (!filtered.length) return;
    await Promise.all(filtered);

    if (Object.keys(updates).length > 0) {
        await sendSaveUpdate(message, updates);
    }
}

/**
 * Roll Overcome for all NPC targets that haven't been rolled yet.
 */
export async function rollOvercomeAll(
    event: MouseEvent,
    message: ChatMessage.Implementation,
): Promise<void> {
    const flagData = getFlagData(message);
    if (!flagData?.save) return;

    const existingSaves = flagData.saves ?? {};

    // Resolve tokens into plain data for the pure filter
    const tokenData: Array<{ token: Sf2eTokenDocument; filterData: { id: string; hasActor: boolean } }> = [];
    for (const uuid of flagData.targets) {
        const token = fromUuidSync(uuid) as Sf2eTokenDocument | null;
        tokenData.push({
            token: token!,
            filterData: { id: token?.id ?? "", hasActor: !!token?.actor },
        });
    }

    const eligible = filterUnrolledTargets(
        tokenData.map((t) => t.filterData),
        existingSaves,
    );

    const eligibleIds = new Set(eligible.map((t) => t.id));
    const unrolledTargets = tokenData
        .filter((t) => eligibleIds.has(t.filterData.id))
        .map((t) => t.token);

    if (unrolledTargets.length === 0) return;

    await rollOvercomeForTargets(event, message, unrolledTargets);
}

/**
 * Roll Overcome for the currently active PC's token(s) in the target list.
 */
export async function rollOvercomeForActiveTokens(
    event: MouseEvent,
    message: ChatMessage.Implementation,
): Promise<void> {
    const flagData = getFlagData(message);
    if (!flagData?.save || !flagData.pradOvercome) return;

    await rollOvercomeAll(event, message);
}

// ─── Overcome Utility Functions ──────────────────────────────────────────────

/**
 * Find the caster's best spellcasting or class DC statistic for rolling
 * an overcome check. Uses the pure `selectBestStatistic` for the selection
 * decision, with Foundry resolution in this shell.
 */
function findBestOvercomeStatistic(caster: Sf2eActor): Sf2eStatistic | null {
    // Collect candidates from spellcasting entries
    const candidates: StatisticCandidate[] = [];

    const spellcasting = caster.spellcasting?.contents;
    if (spellcasting) {
        for (const entry of spellcasting) {
            const stat = entry.statistic;
            if (stat) {
                candidates.push({
                    checkMod: stat.check?.mod ?? null,
                    hasRoll: !!stat.check?.roll,
                    ref: stat,
                });
            }
        }
    }

    // Select best from spellcasting
    const best = selectBestStatistic(candidates);
    if (best) return best.ref as Sf2eStatistic;

    // Fallback: class DC
    const classDC = caster.classDC;
    if (classDC?.check?.roll) return classDC;

    // Fallback: getStatistic API
    if (typeof caster.getStatistic === "function") {
        const stat =
            caster.getStatistic("class-dc") ??
            caster.getStatistic("spell-attack");
        if (stat?.check?.roll) return stat;
    }

    return null;
}
