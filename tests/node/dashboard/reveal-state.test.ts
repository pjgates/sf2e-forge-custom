import { describe, expect, it } from "vitest";
import { SessionRevealState } from "../../../plugin/src/revealState.js";

describe("SessionRevealState", () => {
    it("notifies each matching surface once and honors unsubscribe", () => {
        const state = new SessionRevealState();
        const events: string[] = [];
        state.subscribe("randall.md", () => events.push("reading"));
        const unsubscribe = state.subscribe("randall.md", () => events.push("sidebar"));
        state.subscribe("wren.md", () => events.push("other"));
        state.setRevealed("randall.md", true);
        state.setRevealed("randall.md", true);
        expect(events).toEqual(["reading", "sidebar"]);
        unsubscribe();
        state.setRevealed("randall.md", false);
        expect(events).toEqual(["reading", "sidebar", "reading"]);
        expect(state.isRevealed("randall.md")).toBe(false);
    });
});
