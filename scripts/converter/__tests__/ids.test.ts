import { describe, expect, it } from "vitest";
import { generateId } from "../ids.js";

describe("generateId", () => {
    it("produces a 16-character string", () => {
        const id = generateId("test-slug");
        expect(id).toHaveLength(16);
    });

    it("produces only hex characters", () => {
        const id = generateId("test-slug");
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it("is deterministic — same input always yields same output", () => {
        const a = generateId("scrap-rat");
        const b = generateId("scrap-rat");
        expect(a).toBe(b);
    });

    it("produces different IDs for different inputs", () => {
        const a = generateId("scrap-rat");
        const b = generateId("calix-deroan");
        expect(a).not.toBe(b);
    });

    it("handles empty string input", () => {
        const id = generateId("");
        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
});
