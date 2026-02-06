import { createHash } from "node:crypto";

/**
 * Generate a deterministic 16-character alphanumeric ID from a string key.
 *
 * Uses SHA-256, encoded as hex, truncated to 16 characters.
 * Foundry VTT expects document IDs to be exactly 16 alphanumeric characters.
 *
 * The same key always produces the same ID, so re-running the converter
 * updates entries in place rather than creating duplicates.
 */
export function generateId(key: string): string {
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
