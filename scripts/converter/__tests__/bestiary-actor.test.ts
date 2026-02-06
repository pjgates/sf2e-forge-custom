import { describe, expect, it } from "vitest";
import { buildActorDocument } from "../bestiary-actor.js";
import { generateId } from "../ids.js";
import type { CreatureStatblock, ParsedCreature } from "../bestiary-types.js";

/** Build a minimal valid creature for testing. */
function minimalCreature(overrides: Partial<CreatureStatblock> = {}): ParsedCreature {
    return {
        slug: "test-creature",
        statblock: {
            statblock: true,
            layout: "Pathfinder 2e Creature Layout",
            name: "Test Creature",
            level: 1,
            rarity: "common",
            size: "med",
            traits: ["humanoid"],
            published: true,
            abilities: { str: 2, dex: 1, con: 3, int: 0, wis: 1, cha: -1 },
            perception: { mod: 5, senses: [] },
            languages: ["common"],
            skills: { athletics: 7 },
            ac: 16,
            saves: { fort: 8, ref: 4, will: 5 },
            hp: 25,
            immunities: "",
            resistances: "",
            weaknesses: "",
            speed: { land: 25 },
            strikes: [
                {
                    name: "Fist",
                    type: "melee",
                    bonus: 9,
                    traits: ["agile", "unarmed"],
                    damage: [{ formula: "1d6+4", type: "bludgeoning" }],
                },
            ],
            abilities_top: [],
            abilities_mid: [],
            abilities_bot: [],
            ...overrides,
        },
    };
}

describe("buildActorDocument", () => {
    it("produces a valid NPC actor with correct top-level fields", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;

        expect(actor._id).toBe(generateId("test-creature"));
        expect(actor.name).toBe("Test Creature");
        expect(actor.type).toBe("npc");
        expect(actor.img).toBe("systems/sf2e/icons/default-icons/npc.svg");
    });

    it("maps all six ability modifiers correctly", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const abilities = system.abilities as Record<string, { mod: number }>;

        expect(abilities.str.mod).toBe(2);
        expect(abilities.dex.mod).toBe(1);
        expect(abilities.con.mod).toBe(3);
        expect(abilities.int.mod).toBe(0);
        expect(abilities.wis.mod).toBe(1);
        expect(abilities.cha.mod).toBe(-1);
    });

    it("maps AC, HP, and speed correctly", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const attrs = system.attributes as Record<string, unknown>;

        expect((attrs.ac as { value: number }).value).toBe(16);
        expect((attrs.hp as { max: number; value: number }).max).toBe(25);
        expect((attrs.hp as { value: number }).value).toBe(25);
        expect((attrs.speed as { value: number }).value).toBe(25);
    });

    it("maps saves with expanded names", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const saves = system.saves as Record<string, { value: number; saveDetail: string }>;

        expect(saves.fortitude.value).toBe(8);
        expect(saves.reflex.value).toBe(4);
        expect(saves.will.value).toBe(5);
    });

    it("maps skills correctly", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const skills = system.skills as Record<string, { base: number }>;

        expect(skills.athletics.base).toBe(7);
    });

    it("maps perception with senses", () => {
        const creature = minimalCreature({
            perception: {
                mod: 12,
                senses: [
                    { type: "darkvision" },
                    { type: "scent", acuity: "imprecise", range: 30 },
                ],
            },
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const perception = system.perception as { mod: number; senses: unknown[] };

        expect(perception.mod).toBe(12);
        expect(perception.senses).toHaveLength(2);
        expect(perception.senses[0]).toEqual({ type: "darkvision" });
        expect(perception.senses[1]).toEqual({ type: "scent", acuity: "imprecise", range: 30 });
    });

    it("maps traits, rarity, and size", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const traits = system.traits as { rarity: string; size: { value: string }; value: string[] };

        expect(traits.rarity).toBe("common");
        expect(traits.size.value).toBe("med");
        expect(traits.value).toEqual(["humanoid"]);
    });

    it("maps level and languages", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const details = system.details as { level: { value: number }; languages: { value: string[] } };

        expect(details.level.value).toBe(1);
        expect(details.languages.value).toEqual(["common"]);
    });

    it("maps speed with otherSpeeds", () => {
        const creature = minimalCreature({ speed: { land: 30, fly: 60, swim: 20 } });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const attrs = system.attributes as Record<string, unknown>;
        const speed = attrs.speed as { value: number; otherSpeeds: { type: string; value: number }[] };

        expect(speed.value).toBe(30);
        expect(speed.otherSpeeds).toEqual([
            { type: "fly", value: 60 },
            { type: "swim", value: 20 },
        ]);
    });

    it("includes save notes in allSaves", () => {
        const creature = minimalCreature({
            saves: { fort: 8, ref: 4, will: 5, note: "+2 status to all saves vs. magic" },
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const attrs = system.attributes as Record<string, unknown>;

        expect((attrs.allSaves as { value: string }).value).toBe("+2 status to all saves vs. magic");
    });

    it("formats HP details with immunities, resistances, weaknesses", () => {
        const creature = minimalCreature({
            immunities: "fire, poison",
            resistances: "cold 5",
            weaknesses: "cold iron 5",
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const system = actor.system as Record<string, unknown>;
        const attrs = system.attributes as Record<string, unknown>;
        const hp = attrs.hp as { details: string };

        expect(hp.details).toBe("Immunities fire, poison; Resistances cold 5; Weaknesses cold iron 5");
    });

    // -----------------------------------------------------------------------
    // Item generation tests
    // -----------------------------------------------------------------------

    it("generates melee items from strikes", () => {
        const actor = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];
        const meleeItems = items.filter((i) => i.type === "melee");

        expect(meleeItems).toHaveLength(1);
        const fist = meleeItems[0];
        expect(fist.name).toBe("Fist");

        const system = fist.system as Record<string, unknown>;
        expect((system.bonus as { value: number }).value).toBe(9);
        expect((system.traits as { value: string[] }).value).toEqual(["agile", "unarmed"]);
        expect((system.action as string)).toBe("strike");

        const rolls = system.damageRolls as Record<string, { damage: string; damageType: string }>;
        const rollValues = Object.values(rolls);
        expect(rollValues).toHaveLength(1);
        expect(rollValues[0].damage).toBe("1d6+4");
        expect(rollValues[0].damageType).toBe("bludgeoning");
    });

    it("generates melee items for area attacks with range", () => {
        const creature = minimalCreature({
            strikes: [
                {
                    name: "Grenade",
                    type: "ranged",
                    action: "area-fire",
                    bonus: 3,
                    traits: ["consumable"],
                    damage: [{ formula: "1d8", type: "piercing" }],
                    area: { type: "burst", value: 5 },
                    range: { max: 70 },
                },
            ],
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];
        const melee = items[0];

        const system = melee.system as Record<string, unknown>;
        expect(system.action).toBe("area-fire");
        expect(system.area).toEqual({ type: "burst", value: 5 });
        expect(system.range).toEqual({ increment: null, max: 70 });
    });

    it("generates action items from abilities", () => {
        const creature = minimalCreature({
            abilities_mid: [
                {
                    name: "⬺ Test Ability",
                    desc: "Does something fiery.",
                    traits: ["fire", "arcane"],
                    category: "offensive",
                },
            ],
            abilities_bot: [
                {
                    name: "Passive Thing",
                    desc: "Always on.",
                },
            ],
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];
        const actions = items.filter((i) => i.type === "action");

        expect(actions).toHaveLength(2);

        const active = actions[0];
        expect(active.name).toBe("Test Ability");
        const activeSys = active.system as Record<string, unknown>;
        expect((activeSys.actionType as { value: string }).value).toBe("action");
        expect((activeSys.actions as { value: number }).value).toBe(2);
        expect((activeSys.traits as { value: string[] }).value).toEqual(["fire", "arcane"]);
        expect(activeSys.category).toBe("offensive");

        const passive = actions[1];
        expect(passive.name).toBe("Passive Thing");
        const passiveSys = passive.system as Record<string, unknown>;
        expect((passiveSys.actionType as { value: string }).value).toBe("passive");
        expect((passiveSys.actions as { value: null }).value).toBeNull();
    });

    it("generates action items with reaction icon", () => {
        const creature = minimalCreature({
            abilities_mid: [
                {
                    name: "⬲ Attack of Opportunity",
                    desc: "**Trigger** A creature within reach uses a manipulate action.",
                },
            ],
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];
        const action = items.find((i) => i.type === "action")!;

        expect(action.name).toBe("Attack of Opportunity");
        const sys = action.system as Record<string, unknown>;
        expect((sys.actionType as { value: string }).value).toBe("reaction");
    });

    it("generates lore items", () => {
        const creature = minimalCreature({
            lore: [{ name: "Underworld Lore", mod: 8 }],
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];
        const loreItems = items.filter((i) => i.type === "lore");

        expect(loreItems).toHaveLength(1);
        expect(loreItems[0].name).toBe("Underworld Lore");
        const system = loreItems[0].system as Record<string, unknown>;
        expect((system.mod as { value: number }).value).toBe(8);
    });

    it("generates spellcasting entry items", () => {
        const creature = minimalCreature({
            spellcasting: [
                {
                    name: "Arcane Innate Spells",
                    dc: 20,
                    bonus: 12,
                    desc: "**Cantrips (1st)** detect magic; **1st** magic missile (x2)",
                },
            ],
        });
        const actor = buildActorDocument(creature) as Record<string, unknown>;
        const items = actor.items as Record<string, unknown>[];

        const scEntries = items.filter((i) => i.type === "spellcastingEntry");
        expect(scEntries).toHaveLength(1);
        expect(scEntries[0].name).toBe("Arcane Innate Spells");
        const scSys = scEntries[0].system as Record<string, unknown>;
        expect((scSys.prepared as { value: string }).value).toBe("innate");
        expect((scSys.tradition as { value: string }).value).toBe("arcane");
        expect((scSys.spelldc as { dc: number; value: number }).dc).toBe(20);
        expect((scSys.spelldc as { value: number }).value).toBe(12);
        expect((scSys.description as { value: string }).value).toContain("detect magic");
    });

    it("generates deterministic IDs", () => {
        const a = buildActorDocument(minimalCreature()) as Record<string, unknown>;
        const b = buildActorDocument(minimalCreature()) as Record<string, unknown>;

        expect(a._id).toBe(b._id);

        const items_a = a.items as Record<string, unknown>[];
        const items_b = b.items as Record<string, unknown>[];
        expect(items_a[0]._id).toBe(items_b[0]._id);
    });
});
