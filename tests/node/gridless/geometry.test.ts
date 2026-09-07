import { describe, expect, it } from "vitest";
import { classifyCover, measureTokenDistance } from "../../../src/rulesets/sf2e/gridless/geometry.js";

const token = (x: number, y: number, width = 100, height = width, elevation = 0) => ({ x, y, width, height, elevation });

describe("continuous token distance", () => {
    it("measures a 15 by 20 foot displacement as 25 feet without rounding reach boundaries", () => {
        expect(measureTokenDistance(token(0, 0), token(300, 400), 100, 5)).toBe(25);
        expect(measureTokenDistance(token(0, 0), token(101, 0), 100, 5)).toBeCloseTo(5.05);
    });

    it("preserves large-token reach without snapping positions to an invisible grid", () => {
        expect(measureTokenDistance(token(17, 23, 200), token(217, 73), 100, 5)).toBe(5);
        expect(measureTokenDistance(token(17, 23, 200), token(218, 73), 100, 5)).toBeCloseTo(5.05);
    });

    it("includes elevation in Euclidean measurement", () => {
        expect(measureTokenDistance(token(0, 0), token(300, 400, 100, 100, 60), 100, 5)).toBe(65);
    });

    it("preserves a tall creature's occupied vertical space for reach", () => {
        const tall = { ...token(0, 0, 200), depth: 10 };
        const above = { ...token(0, 0, 100, 100, 15), depth: 5 };
        expect(measureTokenDistance(tall, above, 100, 5)).toBe(10);
    });

    it("does not add vertical distance between ground-standing Tiny and Medium creatures", () => {
        const tiny = { ...token(0, 0), depth: 2.5 };
        expect(measureTokenDistance(tiny, token(100, 0), 100, 5)).toBe(5);
    });
});

describe("agreed automatic cover geometry", () => {
    const origin = { x: 0, y: 50 };
    const target = token(400, 0);

    it("gives intervening creatures lesser cover but not creatures outside the center line", () => {
        expect(classifyCover(origin, target, [token(200, 0)], () => false)).toBe("lesser");
        expect(classifyCover(origin, target, [token(200, 100)], () => false)).toBe("none");
    });

    it("gives partial terrain obstruction lesser cover when the center remains visible", () => {
        expect(classifyCover(origin, target, [token(200, 0)], (_from, to) => to.y === 0)).toBe("lesser");
    });

    it("gives terrain obstruction standard cover when the center ray is blocked", () => {
        expect(classifyCover(origin, target, [token(200, 0)], (_from, to) => to.y === 50)).toBe("standard");
    });

    it("blocks line of effect only when all center and corner rays are blocked", () => {
        expect(classifyCover(origin, target, [], () => true)).toBe("blocked");
        expect(classifyCover(origin, target, [], (_from, to) => to.y !== 50)).toBe("lesser");
        expect(classifyCover(origin, target, [], () => false)).toBe("none");
    });
});
