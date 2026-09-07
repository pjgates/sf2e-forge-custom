import { classifyCover, type Point } from "./geometry.js";
import { isGridlessActive } from "./settings.js";

/** Native PF2e/SF2e effect-area extension on Foundry 14 Regions. */
export type EffectArea = RegionDocument.Implementation & {
    isEffectArea: boolean;
    shapes: { origin: Point }[];
};

export function targetGridlessArea(document: RegionDocument.Implementation, userId: string): void {
    // The feature is restricted to systems installing RegionDocumentPF2e.
    const region = document as EffectArea;
    if (!isGridlessActive() || userId !== game.user!.id || region.parent?.id !== canvas!.scene!.id || !region.isEffectArea) return;
    const origin = region.shapes[0].origin;
    const targets = canvas!.tokens!.placeables.filter((token) => token.actor && token.isVisible && !token.document.hidden
        && token.document.testInsideRegion(region)
        && classifyCover(origin, { x: token.x, y: token.y, width: token.w, height: token.h }, [],
            (from, to) => !!CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: "move", mode: "any" })) !== "blocked");
    // Foundry 14 moved batch target mutation onto TokenLayer; fvtt-types still lacks it.
    const layer = canvas!.tokens! as TokenLayer & { setTargets(ids: string[]): void };
    layer.setTargets(targets.map((token) => token.document.id!));
}

export function activateAreaTargeting(): void {
    Hooks.on("createRegion", (region, _options, userId) => targetGridlessArea(region, userId));
    Hooks.on("updateRegion", (region, _changes, _options, userId) => targetGridlessArea(region, userId));
    // Native Region shapes and movement measurement already use continuous geometry.
}
