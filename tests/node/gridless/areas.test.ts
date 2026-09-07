import { afterEach, expect, it, vi } from "vitest";
import { targetGridlessArea } from "../../../src/rulesets/sf2e/gridless/areas.js";

afterEach(() => vi.unstubAllGlobals());

it("targets native area members with line of effect, only for the placing user on gridless scenes", () => {
    let targetIds: string[] = ["previous"];
    let gridless = true;
    const user = { id: "owner" };
    const tokens = [
        { id: "inside", x: 100, inside: true },
        { id: "outside", x: 300, inside: false },
        { id: "behind-wall", x: 500, inside: true },
    ].map(({ id, x, inside }) => ({ id, x, y: 0, w: 100, h: 100, isVisible: true, actor: {},
        document: { id, hidden: false, testInsideRegion: () => inside } }));
    vi.stubGlobal("game", { user, system: { id: "sf2e" }, settings: { get: () => true } });
    vi.stubGlobal("canvas", { ready: true, scene: { id: "scene" }, grid: { get isGridless() { return gridless; } },
        tokens: { placeables: tokens, setTargets(ids: string[]) { targetIds = ids; } } });
    vi.stubGlobal("CONFIG", { Canvas: { polygonBackends: { move: { testCollision: (_from: unknown, to: { x: number }) => to.x >= 500 } } } });
    const region = { parent: { id: "scene" }, isEffectArea: true, shapes: [{ origin: { x: 0, y: 50 } }] };
    targetGridlessArea(region as never, "other-user");
    expect(targetIds).toEqual(["previous"]);
    targetGridlessArea(region as never, "owner");
    expect(targetIds).toEqual(["inside"]);
    gridless = false;
    targetIds = ["previous"];
    targetGridlessArea(region as never, "owner");
    expect(targetIds).toEqual(["previous"]);
});
