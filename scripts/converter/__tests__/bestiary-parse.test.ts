import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCreature } from "../bestiary-parse.js";
import {
    parseAttackDesc,
    parseAttackName,
    parseDamageString,
    parseSensesString,
    parseSpeedString,
} from "../bestiary-parse.js";

const FIXTURE_DIR = path.join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
    return readFileSync(path.join(FIXTURE_DIR, name), "utf-8");
}

// ---------------------------------------------------------------------------
// Full file parsing
// ---------------------------------------------------------------------------

describe("parseCreature", () => {
    it("parses a well-formed creature frontmatter", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw);

        expect(result).not.toBeNull();
        expect(result!.slug).toBe("scrap-rat");
        expect(result!.statblock.name).toBe("Scrap Rat");
        expect(result!.statblock.level).toBe(-1);
        expect(result!.statblock.rarity).toBe("common");
        expect(result!.statblock.size).toBe("sm");
        expect(result!.statblock.traits).toEqual(["beast"]);
    });

    it("parses ability modifiers from attributes array", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.abilities).toEqual({
            str: 2, dex: 3, con: 1, int: -3, wis: 1, cha: -3,
        });
    });

    it("parses perception from modifier + senses string", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.perception.mod).toBe(7);
        expect(result.statblock.perception.senses).toEqual([
            { type: "low-light-vision" },
            { type: "scent", acuity: "imprecise", range: 30 },
        ]);
    });

    it("parses skills from array of single-key objects", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.skills).toEqual({
            acrobatics: 4, crafting: 4, stealth: 5, thievery: 3,
        });
    });

    it("parses defenses", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.ac).toBe(14);
        expect(result.statblock.hp).toBe(8);
        expect(result.statblock.saves).toEqual({
            fort: 5, ref: 8, will: 2,
        });
    });

    it("parses attacks into strikes", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.strikes).toHaveLength(3);

        const mandibles = result.statblock.strikes[0];
        expect(mandibles.name).toBe("Mandibles");
        expect(mandibles.type).toBe("melee");
        expect(mandibles.bonus).toBe(6);
        expect(mandibles.traits).toEqual(["finesse", "unarmed"]);
        expect(mandibles.damage).toEqual([{ formula: "1d4+2", type: "piercing" }]);

        const grenade = result.statblock.strikes[2];
        expect(grenade.name).toBe("Frag Grenade");
        expect(grenade.type).toBe("ranged");
        expect(grenade.action).toBe("area-fire");
        expect(grenade.area).toEqual({ type: "burst", value: 5 });
        expect(grenade.range).toEqual({ max: 70 });
    });

    it("parses abilities with desc field", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.abilities_mid).toHaveLength(1);
        expect(result.statblock.abilities_mid[0].name).toBe("Scoring");
        expect(result.statblock.abilities_mid[0].desc).toContain("tail Strike");
        expect(result.statblock.abilities_mid[0].category).toBe("offensive");

        expect(result.statblock.abilities_bot).toHaveLength(1);
        expect(result.statblock.abilities_bot[0].name).toBe("Dangerous Recycling");
    });

    it("parses speed from string", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;

        expect(result.statblock.speed).toEqual({ land: 25 });
    });

    it("returns null for files without statblock: true", () => {
        const raw = `---
title: Not a Creature
type: Character
---
# Some Note
`;
        const result = parseCreature("not-creature.md", raw);
        expect(result).toBeNull();
    });

    it("applies defaults for missing optional fields", () => {
        const raw = `---
statblock: true
name: Minimal Creature
level: 1
ac: 15
hp: 20
---
# Minimal
`;
        const result = parseCreature("minimal.md", raw)!;

        expect(result.statblock.rarity).toBe("common");
        expect(result.statblock.size).toBe("med");
        expect(result.statblock.traits).toEqual([]);
        expect(result.statblock.immunities).toBe("");
        expect(result.statblock.resistances).toBe("");
        expect(result.statblock.weaknesses).toBe("");
        expect(result.statblock.abilities_top).toEqual([]);
        expect(result.statblock.abilities_mid).toEqual([]);
        expect(result.statblock.abilities_bot).toEqual([]);
        expect(result.statblock.strikes).toEqual([]);
        expect(result.statblock.spellcasting).toBeUndefined();
        expect(result.statblock.lore).toBeUndefined();
    });

    it("handles published: false correctly", () => {
        const raw = readFixture("scrap-rat.md");
        const result = parseCreature("scrap-rat.md", raw)!;
        expect(result.statblock.published).toBe(false);
    });

    it("defaults published to true when not specified", () => {
        const raw = `---
statblock: true
name: Published Creature
level: 1
ac: 10
hp: 10
---
`;
        const result = parseCreature("published.md", raw)!;
        expect(result.statblock.published).toBe(true);
    });

    it("extracts lore skills from skills array", () => {
        const raw = `---
statblock: true
name: Lore Creature
level: 5
ac: 20
hp: 50
skills:
  - Athletics: 12
  - "Underworld Lore": 8
  - "Lore: Arcana": 6
---
`;
        const result = parseCreature("lore.md", raw)!;

        expect(result.statblock.skills).toEqual({ athletics: 12 });
        expect(result.statblock.lore).toEqual([
            { name: "Underworld Lore", mod: 8 },
            { name: "Arcana Lore", mod: 6 },
        ]);
    });
});

// ---------------------------------------------------------------------------
// String parsing helpers
// ---------------------------------------------------------------------------

describe("parseSensesString", () => {
    it("parses empty/null to empty array", () => {
        expect(parseSensesString(null)).toEqual([]);
        expect(parseSensesString("")).toEqual([]);
    });

    it("parses a single sense", () => {
        expect(parseSensesString("darkvision")).toEqual([
            { type: "darkvision" },
        ]);
    });

    it("parses multiple senses", () => {
        expect(parseSensesString("low-light vision, scent (imprecise) 30 feet")).toEqual([
            { type: "low-light-vision" },
            { type: "scent", acuity: "imprecise", range: 30 },
        ]);
    });

    it("parses sense with range but no acuity", () => {
        expect(parseSensesString("darkvision 60 feet")).toEqual([
            { type: "darkvision", range: 60 },
        ]);
    });

    it("parses sense with precise acuity", () => {
        expect(parseSensesString("tremorsense (precise) 30 feet")).toEqual([
            { type: "tremorsense", acuity: "precise", range: 30 },
        ]);
    });
});

describe("parseSpeedString", () => {
    it("parses simple land speed", () => {
        expect(parseSpeedString("25 feet")).toEqual({ land: 25 });
    });

    it("parses multiple speeds", () => {
        expect(parseSpeedString("25 feet, fly 60 feet, swim 30 feet")).toEqual({
            land: 25,
            fly: 60,
            swim: 30,
        });
    });

    it("handles numeric input", () => {
        expect(parseSpeedString(25)).toEqual({ land: 25 });
    });

    it("handles ft. abbreviation", () => {
        expect(parseSpeedString("30 ft., climb 20 ft.")).toEqual({
            land: 30,
            climb: 20,
        });
    });
});

describe("parseAttackName", () => {
    it("parses melee attack", () => {
        expect(parseAttackName("__Melee__ ⬻ Mandibles")).toEqual({
            type: "melee",
            name: "Mandibles",
        });
    });

    it("parses ranged attack", () => {
        expect(parseAttackName("__Ranged__ ⬻ Frag Grenade")).toEqual({
            type: "ranged",
            name: "Frag Grenade",
        });
    });

    it("handles name without prefix", () => {
        expect(parseAttackName("Fist")).toEqual({
            type: "melee",
            name: "Fist",
        });
    });
});

describe("parseAttackDesc", () => {
    it("parses simple trait list", () => {
        expect(parseAttackDesc("(finesse, unarmed)")).toEqual({
            traits: ["finesse", "unarmed"],
        });
    });

    it("extracts area-fire action", () => {
        const result = parseAttackDesc("(area-fire, consumable, burst 5 ft., range 70 ft.)");
        expect(result.action).toBe("area-fire");
        expect(result.area).toEqual({ type: "burst", value: 5 });
        expect(result.range).toEqual({ max: 70 });
        expect(result.traits).toEqual(["consumable"]);
    });

    it("handles empty desc", () => {
        expect(parseAttackDesc("")).toEqual({ traits: [] });
    });

    it("handles range increment", () => {
        const result = parseAttackDesc("(range increment 30 ft.)");
        expect(result.range).toEqual({ increment: 30 });
    });
});

describe("parseDamageString", () => {
    it("parses simple damage", () => {
        expect(parseDamageString("1d4+2 piercing")).toEqual({
            damage: [{ formula: "1d4+2", type: "piercing" }],
            effects: [],
        });
    });

    it("parses damage with effects", () => {
        const result = parseDamageString("2d6+4 slashing plus Grab");
        expect(result.damage).toEqual([{ formula: "2d6+4", type: "slashing" }]);
        expect(result.effects).toEqual(["Grab"]);
    });

    it("parses multiple damage types", () => {
        const result = parseDamageString("1d8+3 fire plus 1d6 persistent fire");
        expect(result.damage).toEqual([
            { formula: "1d8+3", type: "fire" },
            { formula: "1d6", type: "persistent fire" },
        ]);
        expect(result.effects).toEqual([]);
    });

    it("handles empty string", () => {
        expect(parseDamageString("")).toEqual({
            damage: [],
            effects: [],
        });
    });

    it("parses damage without modifier", () => {
        expect(parseDamageString("1d8 piercing")).toEqual({
            damage: [{ formula: "1d8", type: "piercing" }],
            effects: [],
        });
    });
});
