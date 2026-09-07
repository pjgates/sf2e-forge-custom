import { MODULE_ID } from "../../../constants.js";
import { isGridlessActive } from "./settings.js";
import type { Point } from "./geometry.js";
import { getAttackRanges, type AttackActor, type AttackRange, type PreparedAttack } from "./reach.js";

type Waypoint = TokenDocument.MeasuredMovementWaypoint;
interface RulerData {
    passedWaypoints: Waypoint[];
    pendingWaypoints: Waypoint[];
    plannedMovement: Record<string, { history: Waypoint[]; foundPath: Waypoint[] }>;
}
interface MovementRuler {
    token: Token.Implementation;
    refresh(data: RulerData): void;
    clear(): void;
}

let movementPreviewHeld = false;

/** Registered during init so Foundry can expose an optional, user-configurable binding. */
export function registerMovementPreviewKeybind(): void {
    const refreshControlled = (): void => {
        if (canvas?.ready) for (const token of canvas.tokens!.controlled) token.renderFlags.set({ refreshRuler: true });
    };
    game.keybindings!.register(MODULE_ID, "previewMovement", {
        name: "codex-foundry.gridless.previewMovementName",
        hint: "codex-foundry.gridless.previewMovementHint",
        editable: [],
        onDown: () => {
            if (!isGridlessActive()) return false;
            movementPreviewHeld = true;
            refreshControlled();
            return true;
        },
        onUp: () => {
            const wasHeld = movementPreviewHeld;
            movementPreviewHeld = false;
            if (wasHeld) refreshControlled();
            return wasHeld;
        },
    });
}

/** Movement only: other actions do not spend this distance budget. */
export function movementBudget(speed: number, cost: number): { actions: number; remaining: number } {
    const actions = Math.max(1, Math.ceil(cost / speed));
    return { actions, remaining: actions * speed - cost };
}

export function activateMovementRings(): void {
    let container: PIXI.Container | null = null;
    const previews = new WeakMap<Token.Implementation, { cost: number; center: Point }>();
    const rings = new Map<Token.Implementation, {
        graphics: PIXI.Graphics; label: PIXI.Text; glyph: PIXI.Text;
        attackGraphics: PIXI.Graphics; attackLabels: PIXI.Text[];
        attackActor: AttackActor | null; attackSource: readonly PreparedAttack[] | undefined;
        attackRanges: (AttackRange & { color: number })[]; tokenHeight: number;
        remaining: number; actions: number; scale: number; zoom: number;
    }>();

    function ownTurn(token: Token.Implementation): boolean {
        const combat = game.combat;
        return !!combat?.started && combat.combatant?.token === token.document;
    }

    function remove(token: Token.Implementation): void {
        const ring = rings.get(token);
        if (!ring) return;
        container!.removeChild(ring.attackGraphics);
        ring.attackGraphics.destroy({ children: true });
        container!.removeChild(ring.graphics);
        ring.graphics.destroy({ children: true });
        rings.delete(token);
    }

    function refresh(token: Token.Implementation): void {
        if (!isGridlessActive()) return remove(token);
        const selected = canvas!.tokens!.controlled;
        if (selected.length !== 1 || selected[0] !== token) return remove(token);
        const preview = previews.get(token);
        // This Foundry 14 getter is absent from fvtt-types.
        const nativeToken = token as Token.Implementation & { readonly movementAnimationPromise: Promise<void> | null };
        if (!movementPreviewHeld && !preview && !nativeToken.movementAnimationPromise) return remove(token);
        // Prepared land Speed includes effects and conditions. Native history resets at turn start.
        const system = token.actor?.system as { movement?: { speeds?: { land?: { value: number } } } } | undefined;
        const speed = system?.movement?.speeds?.land?.value ?? 0;
        const cost = preview?.cost ?? (ownTurn(token) ? token.measureMovementPath(token.document.movementHistory).cost : 0);
        // An unreachable path has no movement budget, but weapon reach can still be previewed.
        const budget = speed > 0 && Number.isFinite(cost) ? movementBudget(speed, cost) : null;
        const actions = budget?.actions ?? 0, remaining = budget?.remaining ?? 0;
        let ring = rings.get(token);
        // Prepared system strikes and weapon-specific reach are not modeled by fvtt-types.
        const attackActor = token.actor as unknown as AttackActor | null;
        const attackSource = attackActor?.system.actions;
        const attacksChanged = !ring || ring.attackActor !== attackActor || ring.attackSource !== attackSource;
        const attackRanges = attacksChanged ? getAttackRanges(attackActor).map((range, index) => ({
            ...range, color: new PIXI.Color({ h: (130 + index * 137.508) % 360, s: 65, l: 65 }).toNumber(),
        })) : ring!.attackRanges;
        if (!budget && !attackRanges.length) return remove(token);
        if (!container) {
            container = canvas!.interface!.addChild(new PIXI.Container());
            container.zIndex = 2; // Keep attack labels above the directional flanking fill.
            container.eventMode = "none";
        }
        if (!ring) {
            const attackGraphics = container.addChild(new PIXI.Graphics());
            const graphics = container.addChild(new PIXI.Graphics());
            const label = graphics.addChild(new PIXI.Text("", { fontSize: 16, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 }));
            const glyph = graphics.addChild(new PIXI.Text("", { fontFamily: "Pathfinder2eActions", fontSize: 22,
                fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 }));
            label.anchor.set(0, 0.5); glyph.anchor.set(1, 0.5);
            ring = { graphics, label, glyph, attackGraphics, attackLabels: [], attackActor, attackSource, attackRanges,
                tokenHeight: 0, remaining: -1, actions: 0, scale: 0, zoom: 0 };
            rings.set(token, ring);
        }
        const center = preview?.center ?? token.center;
        ring.graphics.position.set(center.x, center.y);
        ring.attackGraphics.position.set(center.x, center.y);
        ring.graphics.visible = !!budget;
        ring.attackGraphics.visible = attackRanges.length > 0;
        const scale = canvas!.dimensions!.distancePixels;
        const zoom = canvas!.stage!.scale.x;
        const budgetChanged = ring.remaining !== remaining || ring.actions !== actions;
        const projectionChanged = ring.scale !== scale || ring.zoom !== zoom;
        const attacksLayoutChanged = attacksChanged || projectionChanged || ring.tokenHeight !== token.h;
        if (!budgetChanged && !projectionChanged && !attacksLayoutChanged) return;
        ring.attackActor = attackActor; ring.attackSource = attackSource; ring.attackRanges = attackRanges; ring.tokenHeight = token.h;
        ring.remaining = remaining; ring.actions = actions; ring.scale = scale; ring.zoom = zoom;
        if (budgetChanged || projectionChanged) {
            const radius = remaining * scale;
            ring.graphics.clear();
            if (budget) ring.graphics.lineStyle(2 / zoom, 0x77ccff, 0.7).drawCircle(0, 0, radius);
            if (budgetChanged) {
                // Match the system ruler: native 1/2/3-action glyphs, with an overage marker after three.
                ring.glyph.text = String(Math.min(3, actions));
                ring.label.text = (actions > 3 ? "! " : "") + game.i18n!.format("codex-foundry.gridless.movementRemaining", {
                    distance: String(Math.round(remaining * 10) / 10), units: canvas!.grid!.units,
                });
            }
            ring.glyph.position.set(-5 / zoom, -radius);
            ring.label.position.set(5 / zoom, -radius);
            ring.glyph.scale.set(1 / zoom); ring.label.scale.set(1 / zoom);
        }
        if (!attacksLayoutChanged) return;
        ring.attackGraphics.clear();
        while (ring.attackLabels.length > attackRanges.length) {
            const label = ring.attackLabels.pop()!;
            ring.attackGraphics.removeChild(label); label.destroy();
        }
        for (const [index, range] of attackRanges.entries()) {
            ring.attackGraphics.lineStyle(2 / zoom, range.color, 0.85);
            if (range.kind === "reach") ring.attackGraphics.beginFill(range.color, 0.12);
            ring.attackGraphics.drawCircle(0, 0, range.distance * scale).endFill();
            let label = ring.attackLabels[index];
            if (!label) {
                label = ring.attackGraphics.addChild(new PIXI.Text("", { fontSize: 14, fill: range.color, stroke: 0x000000, strokeThickness: 4 }));
                label.anchor.set(0.5, 0);
                ring.attackLabels.push(label);
            }
            if (attacksChanged) {
                label.style.fill = range.color;
                label.text = game.i18n!.format("codex-foundry.gridless.attackDistance", {
                    attacks: range.label, kind: game.i18n!.localize(`codex-foundry.gridless.${range.kind}`),
                    distance: String(range.distance), units: canvas!.grid!.units,
                });
            }
            label.position.set(0, token.h / 2 + (12 + index * 18) / zoom);
            label.scale.set(1 / zoom);
        }
    }

    // Consume the same preview paths as Foundry's ruler, including movement already spent this turn.
    const prototype = CONFIG.Token.rulerClass.prototype as unknown as MovementRuler;
    const originalRefresh = prototype.refresh;
    const originalClear = prototype.clear;
    prototype.refresh = function (data): void {
        originalRefresh.call(this, data);
        if (!isGridlessActive()) return;
        const plan = data.plannedMovement[game.user!.id];
        const end = plan?.foundPath.at(-1);
        if (end) {
            const path = ownTurn(this.token) ? plan.history.concat(plan.foundPath) : plan.foundPath;
            previews.set(this.token, { cost: this.token.measureMovementPath(path).cost, center: this.token.document.getCenterPoint(end) });
        } else previews.delete(this.token);
        refresh(this.token);
    };
    prototype.clear = function (): void {
        originalClear.call(this);
        previews.delete(this.token);
        if (canvas?.ready) refresh(this.token);
    };

    const refreshSelection = (): void => {
        if (!canvas?.ready) return;
        const selected = canvas.tokens!.controlled;
        for (const token of rings.keys()) if (selected.length !== 1 || selected[0] !== token) remove(token);
        if (selected.length === 1) refresh(selected[0]);
    };
    Hooks.on("controlToken", refreshSelection);
    Hooks.on("refreshToken", refresh);
    Hooks.on("destroyToken", (token) => { previews.delete(token); remove(token); });
    Hooks.on("canvasReady", refreshSelection);
    for (const hook of ["updateCombat", "deleteCombat"] as const) Hooks.on(hook, () => {
        if (!canvas?.ready) return;
        for (const token of canvas.tokens!.controlled) { previews.delete(token); refresh(token); }
    });
    Hooks.on("canvasPan", () => { for (const token of rings.keys()) refresh(token); });
    Hooks.on("canvasTearDown", () => {
        movementPreviewHeld = false;
        container?.destroy({ children: true });
        container = null;
        for (const token of rings.keys()) previews.delete(token);
        rings.clear();
    });
    refreshSelection();
}
