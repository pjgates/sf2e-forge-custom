/**
 * PRAD (Players Roll All Dice) — Inversion 1: NPC Attack → Player Armor Save
 *
 * When an NPC attacks a PC, instead of rolling the NPC's attack, a chat card
 * is posted with an "Armor Save" button. The *player* clicks the button to
 * roll their armor save, just like clicking a save button on a spell card.
 *
 * Two entry points:
 *   1. GM clicks the Attack DC on the NPC sheet  → postAttackCard()
 *   2. NPC attack roll intercepted via preCreateChatMessage → postAttackCard()
 * Both post the same chat card; the player then clicks the button.
 */

import { MODULE_ID } from "../constants.js";
import { getSystemFlags } from "../shared/flags.js";
import { resolveHtmlRoot } from "../shared/html.js";
import { getAttackDC, getAttackModifierFromStrike } from "./dc.js";

/** Tracks whether we are currently creating a PRAD message (to avoid re-interception). */
let _pradRollInProgress = false;

// ─── Template path ───────────────────────────────────────────────────────────

const TEMPLATE_ATTACK_CARD = `modules/${MODULE_ID}/dist/templates/prad/attack-card.hbs`;

/**
 * Pre-load the attack card template during init.
 */
export function registerAttackCardTemplate(): void {
    foundry.applications.handlebars.loadTemplates([TEMPLATE_ATTACK_CARD]);
}

// ─── Hook Registration ───────────────────────────────────────────────────────

/**
 * Register the `preCreateChatMessage` hook for intercepting NPC attacks,
 * and the `renderChatMessage` hook for listening to armor save button clicks.
 */
export function registerAttackInterceptHook(): void {
    Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
    Hooks.on("renderChatMessage", onRenderAttackCard);
    console.log(`${MODULE_ID} | PRAD: Attack interception hook registered`);
}

// ─── preCreateChatMessage: intercept NPC attack rolls ────────────────────────

function onPreCreateChatMessage(
    message: ChatMessage.Implementation,
    _data: object,
    _options: object,
    _userId: string
): boolean | void {
    try {
        return _onPreCreateChatMessage(message);
    } catch (err) {
        console.error(`${MODULE_ID} | PRAD: Error in preCreateChatMessage hook`, err);
    }
}

function _onPreCreateChatMessage(
    message: ChatMessage.Implementation,
): boolean | void {
    // Don't intercept our own PRAD messages
    if (_pradRollInProgress) return;

    // Only intercept on the GM's client to avoid duplicate processing
    if (!game.user?.isGM) return;

    // Check if this is an attack roll from the sf2e system
    const flags = getSystemFlags(message);
    if (!flags) return;

    const context = flags.context;
    if (!context) return;

    const rollType = context.type;
    if (rollType !== "attack-roll") return;

    // Identify the attacker actor
    const speakerActorId = message.speaker?.actor;
    if (!speakerActorId) return;

    const attacker = game.actors!.get(speakerActorId as string);
    if (!attacker) return;

    // Only intercept NPC attacks
    if ((attacker.type as string) !== "npc") return;

    // Identify the target
    const targetInfo = flags.target ?? context.target;
    if (!targetInfo) return;

    const rawTargetActor = targetInfo.actor;
    const targetActorId: string | undefined =
        typeof rawTargetActor === "string"
            ? rawTargetActor
            : rawTargetActor?.id;
    if (!targetActorId) return;

    // Resolve the target actor — try UUID first, then world actors
    let targetActor: Actor.Implementation | undefined;
    if (typeof targetActorId === "string" && targetActorId.includes(".")) {
        const resolved = fromUuidSync(targetActorId);
        if (resolved && "type" in resolved) targetActor = resolved as unknown as Actor.Implementation;
    }
    if (!targetActor) {
        targetActor = game.actors!.get(targetActorId) ?? undefined;
    }
    if (!targetActor) return;

    // Only intercept attacks against PCs (characters), not NPC vs NPC
    if ((targetActor.type as string) !== "character") return;

    // Extract the NPC's attack modifier and weapon item from the striking item
    const originItemId = flags.origin?.item ?? context.origin?.item;
    let attackModifier = 0;
    let weaponName = "Strike";
    let weaponItem: Item.Implementation | undefined;

    if (originItemId) {
        const itemId =
            typeof originItemId === "string" && originItemId.includes(".")
                ? originItemId.split(".").pop()!
                : originItemId;
        const strikeItem = attacker.items.get(itemId);
        if (strikeItem) {
            weaponItem = strikeItem;
            weaponName = strikeItem.name ?? "Strike";
            attackModifier = getAttackModifierFromStrike(strikeItem);
        }
    }

    if (attackModifier === 0 && flags.modifiers) {
        const totalMod = flags.modifiers
            .filter((m) => m.enabled)
            .reduce((sum: number, m) => sum + m.modifier, 0);
        if (totalMod !== 0) attackModifier = totalMod;
    }

    if (attackModifier === 0 && message.rolls?.length > 0) {
        const roll = message.rolls[0];
        if (roll.total != null) {
            const dieTerm = roll.terms?.[0] as Sf2eRollDieTerm | undefined;
            const dieValue: number = dieTerm?.results?.[0]?.result ?? 0;
            attackModifier = (roll.total ?? 0) - dieValue;
        }
    }

    const attackDC = getAttackDC(attackModifier);

    console.log(
        `${MODULE_ID} | PRAD: Intercepting ${attacker.name}'s attack (DC ${attackDC}) → posting attack card`
    );

    // Post the attack card instead of auto-rolling
    postAttackCard({
        attacker,
        weaponName,
        attackDC,
        attackerTokenId: message.speaker?.token ?? undefined,
        weaponItem,
    });

    // Cancel the original NPC attack message
    return false;
}

// ─── Attack Card (posted to chat) ────────────────────────────────────────────

interface AttackCardParams {
    attacker: Actor.Implementation;
    weaponName: string;
    attackDC: number;
    attackerTokenId?: string;
    /** The NPC's melee/ranged weapon item, used to enrich the card with traits, range, damage. */
    weaponItem?: Item.Implementation;
}

// ─── Weapon Data Extraction ──────────────────────────────────────────────────

interface DamageRollEntry {
    formula: string;
    damageType: string;
}

interface WeaponDisplayData {
    weaponImg: string;
    actionGlyph: string;
    typeLabel: string;
    traits: Array<{ slug: string; label: string }>;
    hasTraits: boolean;
    rangeLabel: string;
    hasRange: boolean;
    areaLabel: string;
    hasArea: boolean;
    hasRangeOrArea: boolean;
    damageFormula: string;
    hasDamage: boolean;
    hasDetails: boolean;
    damageRolls: DamageRollEntry[];
    weaponItemId: string;
}

/**
 * Extract display-friendly weapon data from an NPC melee/ranged item.
 */
function extractWeaponData(weaponItem: Item.Implementation): WeaponDisplayData {
    const sys = weaponItem.system as Record<string, unknown>;

    // Image
    const weaponImg = (weaponItem as unknown as { img?: string }).img ?? "icons/svg/sword.svg";

    // Action glyph: strikes are 1 action, area-fire is 2 actions
    const action = (sys.action as string) ?? "strike";
    const actionGlyph = action === "area-fire" ? "2" : "1";

    // Type label (shown where "Spell 3" appears on spell cards)
    const range = sys.range as { increment?: number; max?: number | null } | null;
    let typeLabel: string;
    if (action === "area-fire") {
        typeLabel = "Area Attack";
    } else if (range?.increment) {
        typeLabel = "Ranged Strike";
    } else {
        typeLabel = "Melee Strike";
    }

    // ── Damage rolls (extracted first so damage types can feed into traits) ──
    const damageRollsObj = (sys.damageRolls as Record<string, { damage?: string; damageType?: string }>) ?? {};
    const damageRolls: DamageRollEntry[] = [];
    for (const key of Object.keys(damageRollsObj)) {
        const dr = damageRollsObj[key];
        if (dr?.damage) {
            damageRolls.push({
                formula: dr.damage,
                damageType: dr.damageType ?? "untyped",
            });
        }
    }
    const hasDamage = damageRolls.length > 0;

    // ── Traits (enriched: attack + weapon traits + damage types + range) ──
    const traitValues: string[] = ((sys.traits as Record<string, unknown>)?.value as string[]) ?? [];

    // Deduplicate by slug
    const seenSlugs = new Set<string>();
    const traits: Array<{ slug: string; label: string }> = [];
    const addTrait = (slug: string, label: string): void => {
        const key = slug.toLowerCase();
        if (!seenSlugs.has(key)) {
            seenSlugs.add(key);
            traits.push({ slug: key, label });
        }
    };

    // 1. "Attack" — every strike has this trait
    addTrait("attack", "Attack");

    // 2. Weapon traits from item data (e.g. "sonic", "volley 30 ft.")
    for (const t of traitValues) {
        addTrait(t, t.charAt(0).toUpperCase() + t.slice(1));
    }

    // 3. Damage-type traits (e.g. "piercing", "bludgeoning")
    for (const dr of damageRolls) {
        addTrait(dr.damageType, dr.damageType.charAt(0).toUpperCase() + dr.damageType.slice(1));
    }

    // 4. Range increment tag (matches what PF2e damage rolls show)
    if (range?.increment) {
        addTrait("range-increment", `Range Increment ${range.increment} ft.`);
    }

    const hasTraits = traits.length > 0;

    // ── Range / Area (for card-content section) ──────────────────────────
    let rangeLabel = "";
    let hasRange = false;
    if (range?.increment) {
        rangeLabel = `${range.increment} feet`;
        if (range.max) rangeLabel += ` (${range.max} ft. max)`;
        hasRange = true;
    } else if (range?.max) {
        rangeLabel = `${range.max} feet`;
        hasRange = true;
    }

    const area = sys.area as { type?: string; value?: number } | null;
    let areaLabel = "";
    let hasArea = false;
    if (area?.type && area?.value) {
        areaLabel = `${area.value}-foot ${area.type}`;
        hasArea = true;
    }

    const hasRangeOrArea = hasRange || hasArea;

    // ── Damage formula display ───────────────────────────────────────────
    let damageFormula = "";
    if (hasDamage) {
        const parts = damageRolls.map((d) => `${d.formula} ${d.damageType}`);
        damageFormula = `<strong>Damage</strong> ${parts.join(" plus ")}`;
    }

    const hasDetails = hasRangeOrArea || hasDamage;

    return {
        weaponImg,
        actionGlyph,
        typeLabel,
        traits,
        hasTraits,
        rangeLabel,
        hasRange,
        areaLabel,
        hasArea,
        hasRangeOrArea,
        damageFormula,
        hasDamage,
        hasDetails,
        damageRolls,
        weaponItemId: weaponItem.id ?? "",
    };
}

/**
 * Post a chat card that shows the NPC attack and provides an "Armor Save"
 * button for the player to click — identical in concept to a spell save button.
 *
 * When a `weaponItem` is provided the card is enriched with traits, range,
 * damage formulas, and a "Roll Damage" button, matching the PF2e spell card
 * format.
 */
export async function postAttackCard(params: AttackCardParams): Promise<void> {
    const { attacker, weaponName, attackDC, attackerTokenId, weaponItem } = params;

    try {
        _pradRollInProgress = true;

        const saveLabel = game.i18n!.format("PF2E.SaveDCLabel", {
            dc: `<dc>${attackDC}</dc>`,
            type: game.i18n!.localize("sf2e-forge-custom.prad.armorSave"),
        }).replace(/<dc>(.*?)<\/dc>/, '<span data-visibility="all">$1</span>');

        const sf2eAttacker = attacker as Sf2eActor;

        // Extract enriched weapon data when the item is available
        const wd = weaponItem ? extractWeaponData(weaponItem) : null;

        const templateData = {
            attackerId: attacker.id,
            attackerTokenId: attackerTokenId ?? "",
            weaponName,
            attackDC,
            saveLabel,

            // Enriched weapon fields (fall back to sensible defaults)
            weaponImg: wd?.weaponImg ?? sf2eAttacker.img ?? "icons/svg/mystery-man.svg",
            actionGlyph: wd?.actionGlyph ?? "",
            typeLabel: wd?.typeLabel ?? "Strike",
            hasTraits: wd?.hasTraits ?? false,
            traits: wd?.traits ?? [],
            hasDetails: wd?.hasDetails ?? false,
            hasRange: wd?.hasRange ?? false,
            rangeLabel: wd?.rangeLabel ?? "",
            hasArea: wd?.hasArea ?? false,
            areaLabel: wd?.areaLabel ?? "",
            hasRangeOrArea: wd?.hasRangeOrArea ?? false,
            hasDamage: wd?.hasDamage ?? false,
            damageFormula: wd?.damageFormula ?? "",
        };

        const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_ATTACK_CARD, templateData);

        // Get current targets (PCs targeted by this attack)
        const targetUUIDs: string[] = [];
        const sf2eG = game as Sf2eGame;
        const userTargets = sf2eG.user?.targets;
        if (userTargets && typeof (userTargets as Iterable<unknown>)[Symbol.iterator] === "function") {
            for (const token of userTargets) {
                if (token.actor) {
                    targetUUIDs.push(token.document?.uuid ?? token.uuid);
                }
            }
        }

        await ChatMessage.create({
            content,
            speaker: {
                actor: attacker.id,
                token: attackerTokenId,
                alias: attacker.name ?? "Unknown",
            },
            flags: {
                [MODULE_ID]: {
                    pradType: "attack-card",
                    attackDC,
                    weaponName,
                    attackerId: attacker.id,
                    weaponItemId: wd?.weaponItemId ?? "",
                    damageRolls: wd?.damageRolls ?? [],
                    // Target Helper integration: store targets + save data
                    targetHelper: {
                        type: "prad-attack",
                        targets: targetUUIDs,
                        save: {
                            statistic: "ac",
                            dc: attackDC,
                            basic: false,
                        },
                        author: sf2eAttacker.uuid,
                    },
                },
            },
        } as Record<string, unknown>);
    } catch (err) {
        console.error(`${MODULE_ID} | PRAD: Error posting attack card`, err);
    } finally {
        _pradRollInProgress = false;
    }
}

// ─── renderChatMessage: listen for Armor Save button clicks ──────────────────

/**
 * When a PRAD attack card is rendered, attach click listeners to both the
 * "Armor Save" button and the "Roll Damage" button.
 */
function onRenderAttackCard(
    message: ChatMessage.Implementation,
    html: JQuery<HTMLElement> | HTMLElement,
    _data: object,
): void {
    try {
        const root = resolveHtmlRoot(html);
        if (!root) return;

        // ── Armor Save button ────────────────────────────────────────────
        const saveBtn = root.querySelector<HTMLButtonElement>('button[data-action="prad-armor-save"]');
        if (saveBtn && !saveBtn.dataset.pradBound) {
            saveBtn.dataset.pradBound = "true";

            saveBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                const dc = Number(saveBtn.dataset.dc);
                const weaponLabel = saveBtn.dataset.weapon ?? "Strike";
                const attackerId = saveBtn.dataset.attackerId ?? "";
                const attacker = attackerId ? game.actors!.get(attackerId) : undefined;

                rollArmorSavesForActiveTokens(dc, weaponLabel, attacker ?? undefined);
            });
        }

        // ── Roll Damage button ───────────────────────────────────────────
        const dmgBtn = root.querySelector<HTMLButtonElement>('button[data-action="prad-roll-damage"]');
        if (dmgBtn && !dmgBtn.dataset.pradBound) {
            dmgBtn.dataset.pradBound = "true";

            dmgBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                rollWeaponDamage(message);
            });
        }
    } catch (err) {
        console.error(`${MODULE_ID} | PRAD: Error in renderChatMessage hook`, err);
    }
}

// ─── Weapon Damage Roll (triggered by Roll Damage click) ─────────────────────

/**
 * Roll the NPC weapon's damage from data stored in the chat message flags.
 *
 * Tries the system's native strike-damage pipeline first (which produces a
 * proper PF2e damage card). Falls back to a manual `Roll` from the stored
 * formulas if the system path is unavailable.
 */
async function rollWeaponDamage(message: ChatMessage.Implementation): Promise<void> {
    const moduleFlags = (message.flags as Record<string, Record<string, unknown>> | undefined)?.[MODULE_ID];
    if (!moduleFlags) return;

    const attackerId = moduleFlags.attackerId as string | undefined;
    const weaponItemId = moduleFlags.weaponItemId as string | undefined;
    const weaponName = (moduleFlags.weaponName as string) ?? "Strike";

    // ── Try system-native damage via the actor's strike actions ───────
    if (attackerId && weaponItemId) {
        const attacker = game.actors!.get(attackerId) as Sf2eActor | undefined;
        if (attacker) {
            const sys = attacker.system as Record<string, unknown>;
            const actions = sys.actions as Array<{ item?: { id?: string }; damage?: (opts: object) => Promise<unknown> }> | undefined;
            if (Array.isArray(actions)) {
                const strike = actions.find((a) => a.item?.id === weaponItemId);
                if (strike?.damage) {
                    try {
                        await strike.damage({ event: new MouseEvent("click") });
                        return;
                    } catch (err) {
                        console.warn(`${MODULE_ID} | PRAD: System damage roll failed, using fallback`, err);
                    }
                }
            }
        }
    }

    // ── Fallback: manual roll from stored damage formulas ─────────────
    const damageRolls = moduleFlags.damageRolls as DamageRollEntry[] | undefined;
    if (!damageRolls?.length) {
        ui.notifications!.warn("No damage data available for this attack.");
        return;
    }

    const formula = damageRolls.map((d) => d.formula).join(" + ");
    const roll = new Roll(formula);
    await roll.evaluate();

    const damageTypes = [...new Set(damageRolls.map((d) => d.damageType))].join(", ");

    await roll.toMessage({
        speaker: {
            actor: attackerId ?? undefined,
            alias: game.actors!.get(attackerId ?? "")?.name ?? "NPC",
        },
        flavor: `<strong>${weaponName}</strong> Damage (${damageTypes})`,
    } as Record<string, unknown>);
}

// ─── Armor Save Roll (triggered by player click) ────────────────────────────

/**
 * Roll armor saves for the current user's active (selected/owned) tokens.
 * This mirrors the PF2e pattern: game.user.getActiveTokens() → roll for each.
 */
async function rollArmorSavesForActiveTokens(
    attackDC: number,
    weaponName: string,
    attacker?: Actor.Implementation
): Promise<void> {
    const sf2eG = game as Sf2eGame;
    const tokens: Sf2eActiveToken[] = sf2eG.user?.getActiveTokens?.() ?? [];

    if (tokens.length === 0) {
        ui.notifications!.error(game.i18n!.localize("sf2e-forge-custom.prad.noToken"));
        return;
    }

    for (const token of tokens) {
        const actor = token.actor as Sf2eActor | null | undefined;
        if (!actor) continue;

        // Use the PC's ArmorStatistic for a native check card
        const armorStatistic = actor.armorClass?.parent;

        if (armorStatistic?.roll) {
            await armorStatistic.roll({
                dc: { value: attackDC, label: weaponName },
                origin: attacker ?? null,
                target: actor,
                title: game.i18n!.localize("sf2e-forge-custom.prad.armorSave"),
                skipDialog: true,
                createMessage: true,
            });
        } else {
            // Fallback for actors without ArmorStatistic
            const pf2e = sf2eG.pf2e;
            if (pf2e?.Check?.roll && pf2e?.CheckModifier && pf2e?.Modifier) {
                const sys = actor.system as Sf2eActorSystemData;
                const acValue = sys?.attributes?.ac?.value ?? 10;
                const armorMod = acValue - 10;
                const check = new pf2e.CheckModifier(
                    game.i18n!.localize("sf2e-forge-custom.prad.armorSave"),
                    { modifiers: [] },
                    [new pf2e.Modifier({
                        label: game.i18n!.localize("sf2e-forge-custom.prad.armorSave"),
                        modifier: armorMod,
                        type: "untyped",
                    })]
                );
                const actorToken = actor.getActiveTokens?.(true, true)?.[0] ?? null;
                await pf2e.Check.roll(check, {
                    actor,
                    token: actorToken,
                    type: "check",
                    title: game.i18n!.localize("sf2e-forge-custom.prad.armorSave"),
                    dc: { value: attackDC, label: weaponName },
                    skipDialog: true,
                    createMessage: true,
                });
            }
        }
    }
}

// ─── Exports for NPC sheet usage ─────────────────────────────────────────────

export type { AttackCardParams };
