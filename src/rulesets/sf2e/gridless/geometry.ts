export interface Point {
    x: number;
    y: number;
}

export interface Bounds extends Point {
    width: number;
    height: number;
    elevation?: number;
    /** Vertical occupied space in scene distance units, not pixels. */
    depth?: number;
}

export type Cover = "none" | "lesser" | "standard" | "blocked";
export type WallTest = (from: Point, to: Point) => boolean;

/** Keep PF2e's nearest occupied-space centers, but never snap or round them. */
export function measureTokenDistance(from: Bounds, to: Bounds, size: number, distance: number): number {
    const gap = (a: number, aw: number, b: number, bw: number, unit = size): number => Math.max(
        0,
        Math.abs(a + aw / 2 - b - bw / 2) - Math.max(0, aw - unit) / 2 - Math.max(0, bw - unit) / 2,
    );
    return Math.hypot(
        gap(from.x, from.width, to.x, to.width) * distance / size,
        gap(from.y, from.height, to.y, to.height) * distance / size,
        gap(from.elevation ?? 0, Math.max(distance, from.depth ?? distance),
            to.elevation ?? 0, Math.max(distance, to.depth ?? distance), distance),
    );
}

/** Slab intersection of a segment with a creature's occupied rectangle. */
function intersects(from: Point, to: Point, bounds: Bounds): boolean {
    let enter = 0;
    let exit = 1;
    for (const [axis, extent] of [["x", "width"], ["y", "height"]] as const) {
        const delta = to[axis] - from[axis];
        const low = bounds[axis] - from[axis];
        const high = low + bounds[extent];
        if (delta === 0) {
            if (low > 0 || high < 0) return false;
        } else {
            enter = Math.max(enter, Math.min(low / delta, high / delta));
            exit = Math.min(exit, Math.max(low / delta, high / delta));
            if (enter > exit) return false;
        }
    }
    return enter < 1 && exit > 0;
}

/** Approved approximation: five wall rays; creature cover only along the center line. */
export function classifyCover(origin: Point, target: Bounds, creatures: readonly Bounds[], blocks: WallTest): Cover {
    const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const centerBlocked = blocks(origin, center);
    let blocked = Number(centerBlocked);
    for (const x of [target.x, target.x + target.width]) {
        for (const y of [target.y, target.y + target.height]) blocked += Number(blocks(origin, { x, y }));
    }
    if (blocked === 5) return "blocked";
    if (centerBlocked) return "standard";
    if (blocked > 0) return "lesser";
    return creatures.some((creature) => intersects(origin, center, creature)) ? "lesser" : "none";
}
