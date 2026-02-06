/**
 * Shared Flag Helpers
 *
 * Typed accessors for reading system and module flags from chat messages.
 * Uses the Sf2eMessageFlags / Sf2eSystemFlags types from fvtt-augments
 * so call-sites don't need `as Record<string, any>` casts.
 */

import type { Sf2eChatMessageFlags } from "./types.js";

/**
 * Get the SF2e or PF2e system flags from a chat message.
 * Handles both `flags.sf2e` and `flags.pf2e` namespaces.
 */
export function getSystemFlags(message: ChatMessage.Implementation): Sf2eChatMessageFlags | undefined {
    const flags = message.flags as Sf2eMessageFlags;
    return (flags?.sf2e ?? flags?.pf2e) as Sf2eChatMessageFlags | undefined;
}
