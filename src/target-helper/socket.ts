/**
 * Target Helper — Socket Communication
 *
 * Handles cross-client communication for save result updates.
 * When a player rolls a save on a message they don't own,
 * the result is relayed to the GM who updates the message flags.
 */

import { MODULE_ID } from "../constants.js";
import type { SocketMessage, SaveResultData } from "./types.js";
import { getFlagData, updateSaves } from "./flags.js";

const SOCKET_NAME = `module.${MODULE_ID}`;

/**
 * Register the socket listener. Call once during ready hook.
 */
export function registerSocketListener(): void {
    const sf2eG = game as Sf2eGame;
    sf2eG.socket?.on(SOCKET_NAME, onSocketMessage);
    console.log(`${MODULE_ID} | Target Helper: Socket listener registered`);
}

/**
 * Send save results to the GM for flag update.
 * If the current user IS the GM, update directly.
 */
export async function sendSaveUpdate(
    message: ChatMessage.Implementation,
    saves: Record<string, SaveResultData>,
): Promise<void> {
    if (game.user?.isGM) {
        // GM can update directly
        await updateSaves(message, saves);
    } else {
        // Non-GM needs to relay through socket
        const payload: SocketMessage = {
            action: "updateSaves",
            messageId: message.id!,
            saves,
            userId: game.user!.id!,
        };
        (game as Sf2eGame).socket?.emit(SOCKET_NAME, payload);

        // Also try direct update — Foundry may allow the message author
        // to update their own messages
        try {
            await updateSaves(message, saves);
        } catch {
            // Expected to fail for non-authors; GM will handle via socket
        }
    }
}

// ─── Socket Validation ───────────────────────────────────────────────────────

/**
 * Validate the shape of an incoming socket message.
 * Returns true only if the payload has the correct structure.
 */
function isValidSocketMessage(data: unknown): data is SocketMessage {
    if (typeof data !== "object" || data === null) return false;
    const msg = data as Record<string, unknown>;

    if (msg.action !== "updateSaves") return false;
    if (typeof msg.messageId !== "string" || !msg.messageId) return false;
    if (typeof msg.userId !== "string" || !msg.userId) return false;
    if (typeof msg.saves !== "object" || msg.saves === null) return false;

    // Validate each save result has the required fields
    for (const [, result] of Object.entries(msg.saves as Record<string, unknown>)) {
        if (typeof result !== "object" || result === null) return false;
        const r = result as Record<string, unknown>;
        if (typeof r.value !== "number") return false;
        if (typeof r.die !== "number") return false;
        if (typeof r.success !== "string") return false;
    }

    return true;
}

/**
 * Validate that the sender owns at least one of the tokens being updated.
 */
function validateSenderOwnership(userId: string, tokenIds: string[]): boolean {
    const user = game.users!.get(userId);
    if (!user) return false;

    // GM can always send updates
    if (user.isGM) return true;

    // Check if the user owns any of the tokens being updated
    for (const tokenId of tokenIds) {
        const token = canvas?.tokens?.get(tokenId);
        if (token?.isOwner) return true;
        // Also check via actor ownership
        const actor = token?.actor as Sf2eActor | undefined;
        if (actor?.hasPlayerOwner) return true;
    }

    return false;
}

/**
 * Handle incoming socket messages. Only the GM processes updates.
 */
async function onSocketMessage(data: unknown): Promise<void> {
    try {
        if (!game.user?.isGM) return;

        // Validate message shape
        if (!isValidSocketMessage(data)) {
            console.warn(`${MODULE_ID} | Target Helper: Received malformed socket message`, data);
            return;
        }

        // Validate message exists and has target helper flags
        const message = game.messages!.get(data.messageId);
        if (!message) {
            console.warn(`${MODULE_ID} | Target Helper: Message ${data.messageId} not found for save update`);
            return;
        }

        const flagData = getFlagData(message);
        if (!flagData) {
            console.warn(`${MODULE_ID} | Target Helper: Message ${data.messageId} has no target helper flags`);
            return;
        }

        // Validate each token ID is in the message's target list
        const targetUUIDs = flagData.targets ?? [];
        for (const tokenId of Object.keys(data.saves)) {
            const isInTargetList = targetUUIDs.some(
                (uuid) => uuid.includes(tokenId),
            );
            if (!isInTargetList) {
                console.warn(
                    `${MODULE_ID} | Target Helper: Token ${tokenId} is not in target list for message ${data.messageId}`,
                );
                return;
            }
        }

        // Validate sender ownership
        if (!validateSenderOwnership(data.userId, Object.keys(data.saves))) {
            console.warn(
                `${MODULE_ID} | Target Helper: User ${data.userId} does not own any of the updated tokens`,
            );
            return;
        }

        await updateSaves(message, data.saves);
    } catch (err) {
        console.error(`${MODULE_ID} | Target Helper: Error processing socket message`, err);
    }
}
