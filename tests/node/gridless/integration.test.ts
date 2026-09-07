import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateTokenGeometry } from "../../../src/rulesets/sf2e/gridless/tokens.js";
import { applyRollCover, type CoverModifier } from "../../../src/rulesets/sf2e/gridless/cover.js";

let enabled = true;
let gridless = true;
const settings = { get: (_module: string, name: string) => name === "gridlessCombat" ? enabled : true };

beforeEach(() => {
    enabled = gridless = true;
    vi.stubGlobal("game", { system: { id: "pf2e" }, settings, i18n: { localize: (key: string) => key } });
    vi.stubGlobal("canvas", { ready: true, grid: { get isGridless() { return gridless; }, size: 100, distance: 5 }, tokens: { placeables: [] } });
});
afterEach(() => vi.unstubAllGlobals());

describe("native token integration", () => {
    it("uses continuous reach while preserving native flanking eligibility and feature gates", () => {
        class NativeToken {
            x = 0; y = 0; w = 100; h = 100;
            document = { elevation: 0 };
            get mechanicalBounds() { return { x: this.x, y: this.y, width: this.w, height: this.h }; }
            distanceTo(target: NativeToken) { return Math.round(Math.hypot(this.x - target.x, this.y - target.y) / 20); }
            isAdjacentTo(target: NativeToken) { return this.distanceTo(target) === 5; }
            get center() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; }
            checkCollision() { return false; }
            canFlank(target: NativeToken, reach = 5) { return reach >= this.distanceTo(target); }
        }
        vi.stubGlobal("CONFIG", { Token: { objectClass: NativeToken } });
        const attacker = new NativeToken();
        const target = new NativeToken();
        target.x = 101;
        activateTokenGeometry();
        expect(attacker.distanceTo(target)).toBeCloseTo(5.05);
        expect(attacker.canFlank(target)).toBe(false);
        target.x = 99;
        expect(attacker.isAdjacentTo(target)).toBe(true);
        expect(attacker.canFlank(target)).toBe(true);
        target.x = 101;
        enabled = false;
        expect(attacker.distanceTo(target)).toBe(5);
        enabled = true;
        gridless = false;
        expect(attacker.distanceTo(target)).toBe(5);
    });
});

describe("contextual cover modifiers", () => {
    const modifier = (value: number) => ({ slug: "cover", modifier: value, type: "circumstance" });
    it("raises attack AC without stacking with an existing greater-cover circumstance bonus", () => {
        const modifiers = [modifier(4)];
        const statistic = { modifiers, get value() { return 20 + Math.max(...modifiers.map(m => m.modifier)); } };
        const context = { type: "attack-roll", options: new Set<string>(), dc: { value: 24, statistic } };
        expect(applyRollCover({ push: vi.fn() }, context, "standard", modifier(2))).toBe(true);
        expect(context.dc.value).toBe(24);
        modifiers.splice(0, 1);
        expect(statistic.value).toBe(22);
    });
    it("applies standard cover to area Reflex only, and never rolls through complete obstruction", () => {
        const modifiers: CoverModifier[] = [];
        const check = {
            push(value: CoverModifier) { modifiers.push(value); },
            get totalModifier() { return 10 + Math.max(0, ...modifiers.filter(m => m.type === "circumstance").map(m => m.modifier)); },
        };
        const context = { type: "saving-throw", domains: ["reflex"], options: new Set(["area-effect"]) };
        expect(applyRollCover(check, context, "standard", modifier(2))).toBe(true);
        expect(check.totalModifier).toBe(12);
        modifiers.length = 0;
        expect(applyRollCover(check, { ...context, domains: ["fortitude"] }, "standard", modifier(2))).toBe(true);
        expect(check.totalModifier).toBe(10);
        expect(applyRollCover(check, context, "blocked", modifier(2))).toBe(false);
    });
});
