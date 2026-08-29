import { describe, expect, it } from "vitest";
import { isActiveCharacterPath } from "../../../plugin/src/core/entityPath.js";

describe("isActiveCharacterPath", () => {
    it.each([
        ["codex/the-forge/entities/randall.md", true],
        ["codex/floridaverse/vault/the-local.md", true],
        ["codex/aetherverse/entities/valor.md", true],
        ["codex/the-forge/archive/pre-reset/entities/randall.md", false],
        ["codex/the-forge/entities/archive-notes.md", true],
    ])("classifies %s", (path, expected) => {
        expect(isActiveCharacterPath(path)).toBe(expected);
    });
});
