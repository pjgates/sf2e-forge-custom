import { classifyCover, type Cover, type Point } from "./geometry.js";
import { isGridlessActive } from "./settings.js";
import type { EffectArea } from "./areas.js";

export type CoverModifier = { slug: string; modifier: number; type: string };
interface CoverContext {
    type?: string;
    domains?: string[];
    options?: Set<string> | string[];
    isReroll?: boolean;
    item?: { uuid: string } | null;
    origin?: { token?: { object: Token.Implementation | null } | null } | null;
    target?: { token?: { object: Token.Implementation | null } | null } | null;
    dc?: { value: number; statistic?: { modifiers: CoverModifier[]; options?: Set<string>; readonly value: number } | null } | null;
}
interface CoverCheck { push(modifier: CoverModifier): unknown }

interface CombatSystem {
    Check: { roll(check: CoverCheck, context?: CoverContext, ...args: unknown[]): Promise<unknown> };
    Modifier: new (data: CoverModifier & { label: string }) => CoverModifier;
}

export function coverBetween(origin: Point, target: Token.Implementation, source?: Token.Implementation): Cover {
    const creatures = canvas!.tokens!.placeables.filter((token) => {
        // PF2e/SF2e's native Actor extension is not included in fvtt-types.
        const actor = token.actor as (Actor.Implementation & { isOfType(type: string): boolean }) | null;
        return token !== source && token !== target && !token.document.hidden && actor?.isOfType("creature");
    });
    return classifyCover(origin, { x: target.x, y: target.y, width: target.w, height: target.h },
        creatures.map((token) => ({ x: token.x, y: token.y, width: token.w, height: token.h })),
        (from, to) => source
            ? !!source.checkCollision(to, { origin: from, type: "move", mode: "any" })
            : !!CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: "move", mode: "any" }));
}

/** Modify only this roll's contextual statistic, never the actor or a persistent effect. */
export function applyRollCover(check: CoverCheck, context: CoverContext, cover: Cover, modifier: CoverModifier): boolean {
    if (cover === "blocked") return false;
    if (cover === "none") return true;
    const options = context.options instanceof Set ? context.options : new Set(context.options);
    context.options = options;
    if (context.type === "attack-roll" && context.dc?.statistic) {
        options.add(`target:cover-level:${cover}`);
        options.add(`target:cover-bonus:${modifier.modifier}`);
        context.dc.statistic.modifiers.push(modifier);
        context.dc.value = context.dc.statistic.value;
    } else if (context.type === "saving-throw" && context.domains?.includes("reflex") && options.has("area-effect") && cover === "standard") {
        options.add(`self:cover-level:${cover}`);
        options.add(`self:cover-bonus:${modifier.modifier}`);
        check.push(modifier);
    }
    return true;
}

export function activateCover(): void {
    // Both supported systems expose the same verified public game.pf2e API.
    const systemGame = game as unknown as { pf2e: CombatSystem };
    const system = systemGame.pf2e;
    const original = system.Check.roll;
    system.Check.roll = function (check, context = {}, ...args): Promise<unknown> {
        const source = context.origin?.token?.object;
        const target = context.target?.token?.object;
        if (isGridlessActive() && source && target && !context.isReroll
            && ["attack-roll", "saving-throw"].includes(context.type ?? "")) {
            let origin: Point = source.center;
            let collisionSource: Token.Implementation | undefined = source;
            const options = context.options instanceof Set ? context.options : new Set(context.options);
            if (options.has("area-effect")) {
                // Area effects originate at their placed shape, not at the caster.
                const regions = canvas!.scene!.regions.contents as EffectArea[];
                const areas = regions.filter((region) => region.isEffectArea && context.item?.uuid
                    && foundry.utils.getProperty(region, `flags.${game.system!.id}.origin.uuid`) === context.item.uuid);
                const selected = areas.filter((region) => region.object?.controlled);
                const candidates = selected.length ? selected : areas;
                if (candidates.length !== 1) {
                    ui.notifications!.warn(game.i18n!.localize("codex-foundry.gridless.selectArea"));
                    return Promise.resolve(null);
                }
                origin = candidates[0].shapes[0].origin;
                collisionSource = undefined;
            }
            const cover = coverBetween(origin, target, collisionSource);
            const modifier = new system.Modifier({ slug: "cover", label: game.i18n!.localize("codex-foundry.gridless.cover"),
                type: "circumstance", modifier: cover === "standard" ? 2 : 1 });
            if (!applyRollCover(check, context, cover, modifier)) {
                ui.notifications!.warn(game.i18n!.localize("codex-foundry.gridless.blocked"));
                return Promise.resolve(null);
            }
        }
        return original.call(this, check, context, ...args);
    };
}
