/**
 * Target Helper — Flag Helpers
 *
 * Read/write target helper data on chat message flags.
 * All data is stored at: `flags[MODULE_ID].targetHelper`
 */

import { MODULE_ID } from "../constants.js";
import type {
    TargetHelperFlagData,
    SaveResultData,
} from "./types.js";

const FLAG_KEY = "targetHelper";

// ─── Read Helpers ────────────────────────────────────────────────────────────

/**
 * Get the target helper flag data from a chat message, if present.
 */
export function getFlagData(message: ChatMessage.Implementation): TargetHelperFlagData | undefined {
    const flags = message.flags as Sf2eMessageFlags;
    return flags?.[MODULE_ID]?.[FLAG_KEY] as TargetHelperFlagData | undefined;
}

/**
 * Check if a message has target helper data.
 */
export function hasFlagData(message: ChatMessage.Implementation): boolean {
    return !!getFlagData(message);
}

// ─── Write Helpers ───────────────────────────────────────────────────────────

/**
 * Set the full target helper flag data on a message being created.
 * Used in `preCreateChatMessage` to inject flag data before creation.
 */
export function setSourceFlag(
    message: ChatMessage.Implementation,
    data: Partial<TargetHelperFlagData>
): void {
    // Use updateSource to inject flags before the message is created
    (message as Sf2eChatMessage).updateSource({
        [`flags.${MODULE_ID}.${FLAG_KEY}`]: data,
    });
}

/**
 * Update the target helper flags on an existing message.
 * This persists to the database and triggers re-rendering.
 */
export async function updateFlag(
    message: ChatMessage.Implementation,
    updates: Partial<TargetHelperFlagData>
): Promise<void> {
    const existing = getFlagData(message) ?? {} as TargetHelperFlagData;
    const merged = foundry.utils.mergeObject(existing, updates, { inplace: false });
    await (message as Sf2eChatMessage).update({
        [`flags.${MODULE_ID}.${FLAG_KEY}`]: merged,
    });
}

/**
 * Update save results for specific targets on an existing message.
 * Merges new saves into existing saves without overwriting others.
 */
export async function updateSaves(
    message: ChatMessage.Implementation,
    saves: Record<string, SaveResultData>
): Promise<void> {
    const existing = getFlagData(message);
    if (!existing) return;

    const existingSaves = existing.saves ?? {};
    const mergedSaves = { ...existingSaves, ...saves };

    await (message as Sf2eChatMessage).update({
        [`flags.${MODULE_ID}.${FLAG_KEY}.saves`]: mergedSaves,
    });
}

/**
 * Update the targets list on an existing message.
 */
export async function updateTargets(
    message: ChatMessage.Implementation,
    targets: string[]
): Promise<void> {
    await (message as Sf2eChatMessage).update({
        [`flags.${MODULE_ID}.${FLAG_KEY}.targets`]: targets,
    });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Get the current user's targeted tokens as an array of UUIDs.
 */
export function getCurrentTargetUUIDs(): string[] {
    const sf2eG = game as Sf2eGame;
    const targets = sf2eG.user?.targets;
    if (!targets || typeof (targets as Iterable<unknown>)[Symbol.iterator] !== "function") return [];

    const uuids: string[] = [];
    for (const token of targets) {
        const actor = token.actor;
        if (actor && ["creature", "npc", "character", "hazard", "vehicle"].includes(actor.type as string)) {
            uuids.push(token.document?.uuid ?? token.uuid);
        }
    }
    return uuids;
}
