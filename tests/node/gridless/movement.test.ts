import { Color } from "@pixi/color";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateMovementRings, movementBudget, registerMovementPreviewKeybind } from "../../../src/rulesets/sf2e/gridless/movement.js";
import type { AttackItem, PreparedAttack } from "../../../src/rulesets/sf2e/gridless/reach.js";

interface PreviewBinding { onDown(): boolean; onUp(): boolean }
let releasePreview: (() => boolean) | undefined;
afterEach(() => { releasePreview?.(); releasePreview = undefined; vi.unstubAllGlobals(); });

describe("movement action budget", () => {
    it("starts with one Stride and advances only after its distance is exceeded", () => {
        expect(movementBudget(25, 0)).toEqual({ actions: 1, remaining: 25 });
        expect(movementBudget(25, 10)).toEqual({ actions: 1, remaining: 15 });
        expect(movementBudget(25, 25)).toEqual({ actions: 1, remaining: 0 });
        expect(movementBudget(25, 26)).toEqual({ actions: 2, remaining: 24 });
        expect(movementBudget(25, 51)).toEqual({ actions: 3, remaining: 24 });
    });

    it("uses current Speed without resetting distance already spent", () => {
        expect(movementBudget(30, 20)).toEqual({ actions: 1, remaining: 10 });
    });
});

function setupMovementCanvas() {
    const callbacks: Record<string, (...args: unknown[]) => void> = {};
    class Container {
        children: Container[] = [];
        visible = true;
        position = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
        scale = { set() {} };
        addChild(child: Container) { this.children.push(child); return child; }
        removeChild(child: Container) { this.children.splice(this.children.indexOf(child), 1); }
        destroy() { this.children = []; }
    }
    class Graphics extends Container {
        circles: { radius: number; fillAlpha: number; color: number }[] = [];
        fillAlpha = 0;
        color = 0;
        get radii() { return this.circles.map(circle => circle.radius); }
        clear() { this.circles = []; this.fillAlpha = 0; return this; }
        lineStyle(_width = 0, color = 0) { this.color = color; return this; }
        beginFill(_color: number, alpha = 1) { this.fillAlpha = alpha; return this; }
        endFill() { this.fillAlpha = 0; return this; }
        drawCircle(_x: number, _y: number, radius: number) {
            this.circles.push({ radius, fillAlpha: this.fillAlpha, color: this.color }); return this;
        }
    }
    class Text extends Container {
        anchor = { set() {} };
        constructor(public text: string, public style: { fontFamily?: string }) { super(); }
    }
    const reaches = new Map<AttackItem, number>();
    const makeToken = (id: string) => {
        const token = {
            id, controlled: false, center: { x: 100, y: 200 }, w: 100, h: 100, movementAnimationPromise: null as Promise<void> | null,
            actor: {
                system: { actions: [] as PreparedAttack[], movement: { speeds: { land: { value: 25 } } } },
                getReach: ({ weapon }: { weapon: AttackItem }) => reaches.get(weapon) ?? 5,
            },
            document: {
                id, parent: { id: "scene" }, movementHistory: [{ x: 0, y: 0, cost: 0 }],
                getCenterPoint(point: { x: number; y: number }) { return point; },
            },
            renderFlags: { set: (): void => { callbacks.refreshToken?.(token, {}); } },
            measureMovementPath(points: { cost?: number }[]) { return { cost: points.reduce((sum, point) => sum + (point.cost ?? 0), 0) }; },
        };
        return token;
    };
    const token = makeToken("token");
    const other = makeToken("other");
    token.controlled = true;
    type MovementTokenFixture = typeof token;
    const controlled = [token];
    class Ruler { constructor(public token: MovementTokenFixture) {} refresh(_data: unknown) {} clear() {} }
    const combatant: { tokenId: string; sceneId: string | null; token: MovementTokenFixture["document"] } = {
        tokenId: "token", sceneId: "scene", token: token.document,
    };
    const combat = { started: true, combatant };
    const bindings = new Map<string, PreviewBinding>();
    const interfaceLayer = new Container();
    vi.stubGlobal("PIXI", { Container, Graphics, Text, Color });
    vi.stubGlobal("CONFIG", { Token: { rulerClass: Ruler } });
    vi.stubGlobal("Hooks", { on(name: string, callback: (...args: unknown[]) => void) { callbacks[name] = callback; } });
    vi.stubGlobal("game", { user: { id: "user" }, combat, system: { id: "pf2e" }, settings: { get: () => true },
        keybindings: { register: (_namespace: string, key: string, binding: PreviewBinding) => bindings.set(key, binding) },
        i18n: {
            localize: (key: string) => key.endsWith(".reach") ? "Reach" : "Range",
            format: (_key: string, data: { distance: string; attacks?: string }) => data.attacks ? `${data.attacks}: ${data.distance} ft` : `${data.distance} ft left`,
        } });
    vi.stubGlobal("canvas", { ready: true, scene: { id: "scene" }, grid: { isGridless: true, units: "ft" },
        dimensions: { distancePixels: 20 }, stage: { scale: { x: 1 } }, interface: interfaceLayer, tokens: { controlled } });
    registerMovementPreviewKeybind();
    const binding = bindings.get("previewMovement")!;
    releasePreview = binding.onUp;
    activateMovementRings();
    const visibleGraphics = () => interfaceLayer.children.flatMap(container => container.children).filter((child): child is Graphics => child instanceof Graphics && child.visible);
    const isBudget = (graphic: Graphics) => graphic.children.some(child => child instanceof Text && child.style.fontFamily === "Pathfinder2eActions");
    const radii = () => visibleGraphics().filter(isBudget).flatMap(graphic => graphic.radii);
    const attackCircles = () => visibleGraphics().filter(graphic => !isBudget(graphic)).flatMap(graphic => graphic.circles);
    const glyph = () => visibleGraphics().flatMap(graphic => graphic.children)
        .find((child): child is Text => child instanceof Text && child.style.fontFamily === "Pathfinder2eActions");
    const select = (next: MovementTokenFixture[]) => {
        for (const previous of [...controlled]) {
            if (next.includes(previous)) continue;
            controlled.splice(controlled.indexOf(previous), 1); previous.controlled = false;
            callbacks.controlToken(previous, false);
        }
        for (const selected of next) {
            if (controlled.includes(selected)) continue;
            controlled.push(selected); selected.controlled = true;
            callbacks.controlToken(selected, true);
        }
    };
    return { token, other, callbacks, combat, combatant, binding, radii, attackCircles, reaches, glyph: () => glyph()?.text,
        select, ruler: new Ruler(token) };
}

it("retains the movement budget during hold preview, drag cancellation, and turn changes", () => {
    const { token, callbacks, combat, combatant, binding, radii, glyph, ruler, select } = setupMovementCanvas();
    expect(radii()).toEqual([]);
    binding.onDown();
    expect(radii()).toEqual([500]);
    expect(glyph()).toBe("1");
    token.document.movementHistory.push({ x: 200, y: 0, cost: 10 });
    token.center = { x: 200, y: 0 };
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([300]);
    combatant.sceneId = null;
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([300]);
    const planned = { history: token.document.movementHistory, foundPath: [{ x: 520, y: 0, cost: 16 }] };
    ruler.refresh({ passedWaypoints: token.document.movementHistory, pendingWaypoints: [], plannedMovement: { user: planned } });
    expect(radii()).toEqual([480]);
    expect(glyph()).toBe("2");
    ruler.refresh({ passedWaypoints: token.document.movementHistory, pendingWaypoints: [], plannedMovement: {} });
    expect(radii()).toEqual([300]);
    token.document.movementHistory = [];
    callbacks.updateCombat(combat, {});
    expect(radii()).toEqual([500]);
    token.document.movementHistory = [{ x: 0, y: 0, cost: 0 }, { x: 200, y: 0, cost: 10 }];
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([300]);
    vi.stubGlobal("game", { ...game, combat: null });
    callbacks.deleteCombat?.(combat, {});
    expect(radii()).toEqual([500]);
    select([]);
    expect(radii()).toEqual([]);
});

it("shows only one selected token while moving or holding the shortcut", () => {
    const { token, other, callbacks, binding, radii, ruler, select } = setupMovementCanvas();
    expect(radii()).toEqual([]);
    const planned = { history: token.document.movementHistory, foundPath: [{ x: 200, y: 0, cost: 10 }] };
    ruler.refresh({ passedWaypoints: [], pendingWaypoints: [], plannedMovement: { user: planned } });
    expect(radii()).toEqual([300]);
    ruler.clear();
    expect(radii()).toEqual([]);
    token.movementAnimationPromise = Promise.resolve();
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([500]);
    token.movementAnimationPromise = null;
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([]);
    binding.onDown();
    expect(radii()).toEqual([500]);
    select([token, other]);
    expect(radii()).toEqual([]);
    ruler.refresh({ passedWaypoints: [], pendingWaypoints: [], plannedMovement: { user: planned } });
    expect(radii()).toEqual([]);
    ruler.clear();
    select([token]);
    expect(radii()).toEqual([500]);
    binding.onUp();
    expect(radii()).toEqual([]);
    select([]);
    binding.onDown();
    expect(radii()).toEqual([]);
});

it("renders filled melee reach and unfilled ranged distance without requiring land Speed", () => {
    const { token, other, binding, callbacks, attackCircles, reaches, radii, select } = setupMovementCanvas();
    const sword = { name: "Sword", isMelee: true, range: null };
    const tail = { name: "Tail", isMelee: true, range: null };
    const rifle = { name: "Rifle", isMelee: false, range: { increment: 60, max: 360 } };
    reaches.set(sword, 5); reaches.set(tail, 10);
    token.actor.system.actions = [
        { label: "Sword", ready: true, item: sword },
        { label: "Tail", ready: true, item: tail },
        { label: "Rifle", ready: true, item: rifle },
    ];
    binding.onDown();
    expect(attackCircles().map(circle => circle.radius)).toEqual([1200, 200, 100]);
    expect(attackCircles()[0].fillAlpha).toBe(0);
    expect(attackCircles().slice(1).every(circle => circle.fillAlpha > 0 && circle.fillAlpha < 1)).toBe(true);
    expect(new Set(attackCircles().map(circle => circle.color)).size).toBe(3);
    token.actor.system.movement.speeds.land.value = 0;
    callbacks.refreshToken(token, {});
    expect(radii()).toEqual([]);
    expect(attackCircles().map(circle => circle.radius)).toEqual([1200, 200, 100]);
    token.actor.system.actions = [{ label: "Rifle", ready: true, item: rifle }];
    callbacks.refreshToken(token, {});
    expect(attackCircles().map(circle => circle.radius)).toEqual([1200]);
    select([token, other]);
    expect(attackCircles()).toEqual([]);
});
