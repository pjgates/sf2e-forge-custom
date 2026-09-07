import { describe, expect, it } from "vitest";
import { getAttackRanges, type AttackActor, type AttackItem, type PreparedAttack } from "../../../src/rulesets/sf2e/gridless/reach.js";

function actorWith(actions: PreparedAttack[], reaches: Map<AttackItem, number>): AttackActor {
    return { system: { actions }, getReach: ({ weapon }) => reaches.get(weapon)! };
}

describe("prepared attack reach overlays", () => {
    it("uses weapon-specific reach, groups equal distances, and keeps ranged circles distinct", () => {
        const claw = { name: "Claw", isMelee: true, range: null };
        const tail = { name: "Tail", isMelee: true, range: null };
        const bite = { name: "Bite", isMelee: true, range: null };
        const rifle = { name: "Rifle", isMelee: false, range: { increment: 60, max: 360 } };
        const actor = actorWith([
            { label: "Claw", ready: true, item: claw },
            { label: "Tail", ready: true, item: tail },
            { label: "Bite", ready: true, item: bite },
            { label: "Rifle", ready: true, item: rifle },
        ], new Map<AttackItem, number>([[claw, 10], [tail, 10], [bite, 5]]));
        expect(getAttackRanges(actor)).toEqual([
            { kind: "range", distance: 60, label: "Rifle" },
            { kind: "reach", distance: 10, label: "Claw, Tail" },
            { kind: "reach", distance: 5, label: "Bite" },
        ]);
    });

    it("includes ready alternate usages but excludes unavailable and hidden attacks", () => {
        const stored = { name: "Stored weapon", isMelee: true, range: null };
        const thrown = { name: "Thrown knife", isMelee: false, range: { increment: 20, max: 120 } };
        const hidden = { name: "Hidden fist", isMelee: true, range: null };
        const actor = actorWith([
            { label: "Stored weapon", ready: false, item: stored, altUsages: [{ label: "Thrown knife", ready: true, item: thrown }] },
            { label: "Hidden fist", ready: true, visible: false, item: hidden },
        ], new Map<AttackItem, number>([[stored, 10], [hidden, 5]]));
        expect(getAttackRanges(actor)).toEqual([{ kind: "range", distance: 20, label: "Thrown knife" }]);
    });

    it("does not merge ranged and melee attacks at the same distance or lose fixed maximum ranges", () => {
        const jaws = { name: "Jaws", isMelee: true, range: null };
        const spit = { name: "Spit", isMelee: false, range: { increment: null, max: 5 } };
        const actor = actorWith([
            { label: "Jaws", ready: true, item: jaws },
            { label: "Spit", ready: true, item: spit },
        ], new Map<AttackItem, number>([[jaws, 5]]));
        expect(getAttackRanges(actor)).toEqual([
            { kind: "reach", distance: 5, label: "Jaws" },
            { kind: "range", distance: 5, label: "Spit" },
        ]);
    });

    it("preserves item-specific hazard reach and valid zero reach", () => {
        const blade = { name: "Blade trap", isMelee: true, range: null, reach: 20 };
        const tiny = { name: "Tiny bite", isMelee: true, range: null, reach: 0 };
        const actor = actorWith([
            { label: "Blade trap", ready: true, item: blade },
            { label: "Tiny bite", ready: true, item: tiny },
        ], new Map<AttackItem, number>([[blade, 0], [tiny, 0]]));
        expect(getAttackRanges(actor)).toEqual([
            { kind: "reach", distance: 20, label: "Blade trap" },
            { kind: "reach", distance: 0, label: "Tiny bite" },
        ]);
    });
});
