import { describe, expect, it } from "vitest";
import { normalizePortraitTarget } from "../../../plugin/src/core/portrait.js";

describe("normalizePortraitTarget", () => {
    it.each([
        ["[[randall.webp]]", "randall.webp"],
        ["![[barbara-morgan.webp]]", "barbara-morgan.webp"],
        ["![[barbara-morgan.webp|portrait]]", "barbara-morgan.webp"],
        [" randall.webp ", "randall.webp"],
        [undefined, undefined],
        ["  ", undefined],
    ])("normalizes %s", (value, expected) => {
        expect(normalizePortraitTarget(value)).toBe(expected);
    });
});
