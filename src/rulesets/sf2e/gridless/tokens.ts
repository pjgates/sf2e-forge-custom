import { measureTokenDistance, type Bounds, type Point } from "./geometry.js";
import { coverBetween } from "./cover.js";
import { isGridlessActive } from "./settings.js";

export type SystemToken = Token.Implementation & {
    actor: (Actor.Implementation & {
        dimensions: { height: number };
        getReach(context: { action: "attack" }): number;
        isOfType(type: "creature"): boolean;
        isAllyOf(actor: Actor.Implementation): boolean;
    }) | null;
    mechanicalBounds: Bounds;
    distanceTo(target: SystemToken | Point, context?: { reach?: number | null }): number;
    isAdjacentTo(target: SystemToken): boolean;
    canFlank(target: SystemToken, context?: { reach?: number; ignoreFlankable?: boolean }): boolean;
    isFlanking(target: SystemToken, context?: { reach?: number; ignoreFlankable?: boolean }): boolean;
    onOppositeSides(first: SystemToken, second: SystemToken, target: SystemToken): boolean;
};

export function activateTokenGeometry(): void {
    const prototype = CONFIG.Token.objectClass.prototype as SystemToken;
    const { distanceTo, isAdjacentTo, canFlank } = prototype;
    prototype.distanceTo = function (target, context): number {
        if (!isGridlessActive()) return distanceTo.call(this, target, context);
        if (this === target) return 0;
        const { size, distance } = canvas!.grid!;
        const from = { ...this.mechanicalBounds, elevation: this.document.elevation, depth: this.actor?.dimensions.height };
        const to = "document" in target
            ? { ...target.mechanicalBounds, elevation: target.document.elevation, depth: target.actor?.dimensions.height }
            : { x: target.x - size / 2, y: target.y - size / 2, width: size, height: size, elevation: from.elevation };
        return measureTokenDistance(from, to, size, distance);
    };
    prototype.isAdjacentTo = function (target): boolean {
        if (!isGridlessActive()) return isAdjacentTo.call(this, target);
        const distance = this.distanceTo(target);
        return distance > 0 && distance <= canvas!.grid!.distance;
    };
    prototype.canFlank = function (target, context): boolean {
        return canFlank.call(this, target, context)
            && (!isGridlessActive() || coverBetween(this.center, target, this) !== "blocked");
    };
    // Native opposite-side geometry, Gang Up, immunities, and off-guard remain in charge.
}
