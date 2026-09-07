import { Polygon } from "@pixi/math";
import { describe, expect, it } from "vitest";
import { sampleFlankingSectors } from "../../../src/rulesets/sf2e/gridless/flanking.js";

describe("filled flanking direction sectors", () => {
    const center = { x: 0, y: 0 };
    const inReach = (x: number, y: number) => Math.hypot(x, y) <= 100;

    it("fills valid directions toward the center without marking the wrong side or out-of-reach space", () => {
        const bands = sampleFlankingSectors(center, 150, inReach, (x) => x < 0).map(points => new Polygon(points));
        expect(bands.some(band => band.contains(-95, 2))).toBe(true);
        expect(bands.some(band => band.contains(95, 2))).toBe(false);
        expect(bands.some(band => band.contains(-105, 2))).toBe(false);
        expect(bands.some(band => band.contains(-50, 2))).toBe(true);
    });

    it("omits obstructed positions and shows nothing without an eligible flanking position", () => {
        const bands = sampleFlankingSectors(center, 150, inReach, (x, y) => x < 0 && y < -20).map(points => new Polygon(points));
        expect(bands.some(band => band.contains(-67, -67))).toBe(true);
        expect(bands.some(band => band.contains(-95, 2))).toBe(false);
        expect(bands.some(band => band.contains(-5, -5))).toBe(true);
        expect(sampleFlankingSectors(center, 150, inReach, () => false)).toEqual([]);
    });
});
