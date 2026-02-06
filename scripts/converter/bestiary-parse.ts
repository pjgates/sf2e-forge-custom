import matter from "gray-matter";
import type {
    AbilityEntry,
    AbilityScores,
    CreatureStatblock,
    DamageRollData,
    LoreSkillData,
    ParsedCreature,
    PerceptionData,
    SavesData,
    SenseData,
    SpeedData,
    SpellcastingEntry,
    StrikeData,
} from "./bestiary-types.js";

/**
 * Parse a bestiary creature markdown file into structured data.
 *
 * The creature's mechanical data lives entirely in the YAML frontmatter
 * using the Pathfinder 2e Creature Layout format. The parser translates
 * this layout-compatible format into our internal normalised types.
 *
 * The markdown body is ignored — it's for notes/lore viewed in Obsidian only.
 *
 * Returns null if the file doesn't have `statblock: true` in frontmatter.
 */
export function parseCreature(
    filename: string,
    raw: string,
): ParsedCreature | null {
    const slug = filename.replace(/\.md$/, "");
    const { data } = matter(raw);

    if (data.statblock !== true) {
        return null;
    }

    const statblock = normaliseStatblock(data);
    return { slug, statblock };
}

// ---------------------------------------------------------------------------
// Top-level normalisation
// ---------------------------------------------------------------------------

function normaliseStatblock(data: Record<string, unknown>): CreatureStatblock {
    const { skills, lore } = normaliseSkillsArray(data.skills);

    return {
        statblock: true,
        layout: String(data.layout ?? "Pathfinder 2e Creature Layout"),
        name: String(data.name ?? "Unnamed Creature"),
        level: parseLevel(data.level),
        rarity: normaliseEnum(data.rarity, ["common", "uncommon", "rare", "unique"], "common"),
        size: normaliseSize(data.size),
        traits: toStringArray(data.traits),
        published: data.published !== false,
        source: data.source ? String(data.source) : undefined,

        abilities: normaliseAttributes(data.attributes),
        perception: normalisePerception(data.modifier, data.senses),
        languages: normaliseLanguages(data.languages),
        skills,

        ac: Number(data.ac ?? 10),
        acNote: data.acNote ? String(data.acNote) : undefined,
        saves: normaliseSaves(data.saves),
        hp: Number(data.hp ?? 1),
        hpNote: data.hpNote ? String(data.hpNote) : undefined,
        immunities: normaliseString(data.immunities),
        resistances: normaliseString(data.resistances),
        weaknesses: normaliseString(data.weaknesses),

        speed: normaliseSpeed(data.speed),
        strikes: normaliseAttacks(data.attacks),

        abilities_top: normaliseAbilityList(data.abilities_top),
        abilities_mid: normaliseAbilityList(data.abilities_mid),
        abilities_bot: normaliseAbilityList(data.abilities_bot),

        spellcasting: data.spellcasting ? normaliseSpellcasting(data.spellcasting) : undefined,
        lore: lore.length > 0 ? lore : undefined,
        items: data.items ? String(data.items) : undefined,
    };
}

// ---------------------------------------------------------------------------
// Level: "Creature -1" → -1
// ---------------------------------------------------------------------------

function parseLevel(raw: unknown): number {
    if (typeof raw === "number") return raw;
    const str = String(raw ?? "0");
    // Handle "Creature -1", "Creature 5", etc.
    const match = str.match(/(-?\d+)/);
    return match ? Number(match[1]) : 0;
}

// ---------------------------------------------------------------------------
// Size: "small" / "Small" / "sm" → "sm"
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<string, CreatureStatblock["size"]> = {
    tiny: "tiny",
    small: "sm",
    sm: "sm",
    medium: "med",
    med: "med",
    large: "lg",
    lg: "lg",
    huge: "huge",
    gargantuan: "grg",
    grg: "grg",
};

function normaliseSize(raw: unknown): CreatureStatblock["size"] {
    const str = String(raw ?? "medium").toLowerCase();
    return SIZE_MAP[str] ?? "med";
}

// ---------------------------------------------------------------------------
// Attributes: [{str: 2}, {dex: 3}, ...] → AbilityScores
// ---------------------------------------------------------------------------

function normaliseAttributes(raw: unknown): AbilityScores {
    const result: AbilityScores = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

    if (Array.isArray(raw)) {
        // Layout format: array of single-key objects
        for (const entry of raw) {
            if (entry && typeof entry === "object") {
                for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
                    const k = key.toLowerCase() as keyof AbilityScores;
                    if (k in result) {
                        result[k] = Number(val ?? 0);
                    }
                }
            }
        }
    } else if (raw && typeof raw === "object") {
        // Legacy format: {str: 2, dex: 3, ...}
        const obj = raw as Record<string, unknown>;
        for (const k of ["str", "dex", "con", "int", "wis", "cha"] as const) {
            if (obj[k] != null) result[k] = Number(obj[k]);
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Perception: modifier + senses string → PerceptionData
// ---------------------------------------------------------------------------

function normalisePerception(modifier: unknown, sensesRaw: unknown): PerceptionData {
    return {
        mod: Number(modifier ?? 0),
        senses: parseSensesString(sensesRaw),
    };
}

/**
 * Parse a senses string like "low-light vision, scent (imprecise) 30 feet"
 * into structured SenseData[].
 */
export function parseSensesString(raw: unknown): SenseData[] {
    if (raw == null) return [];

    // If it's already an array, handle each element
    if (Array.isArray(raw)) {
        return raw.flatMap((item) => {
            if (typeof item === "string") return parseSingleSense(item);
            if (item && typeof item === "object") {
                const obj = item as Record<string, unknown>;
                const sense: SenseData = { type: String(obj.type ?? "") };
                if (obj.acuity) sense.acuity = String(obj.acuity) as SenseData["acuity"];
                if (obj.range != null) sense.range = Number(obj.range);
                return [sense];
            }
            return [];
        });
    }

    const str = String(raw).trim();
    if (!str) return [];

    // Split on commas, parse each sense
    return str.split(/,\s*/).map(parseSingleSense);
}

/**
 * Parse a single sense string like:
 * - "low-light vision"
 * - "scent (imprecise) 30 feet"
 * - "darkvision 60 feet"
 * - "tremorsense (precise) 30 feet"
 */
function parseSingleSense(raw: string): SenseData {
    const str = raw.trim();

    // Pattern: type (acuity) range feet
    const match = str.match(
        /^(.+?)\s*(?:\((precise|imprecise|vague)\))?\s*(?:(\d+)\s*(?:feet|ft\.?))?$/i,
    );

    if (!match) {
        return { type: slugify(str) };
    }

    const sense: SenseData = { type: slugify(match[1].trim()) };
    if (match[2]) sense.acuity = match[2].toLowerCase() as SenseData["acuity"];
    if (match[3]) sense.range = Number(match[3]);
    return sense;
}

// ---------------------------------------------------------------------------
// Languages: string or array → string[]
// ---------------------------------------------------------------------------

function normaliseLanguages(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((l) => typeof l === "string" && l.trim());
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        return trimmed.split(/[,;]\s*/).filter(Boolean);
    }
    return [];
}

// ---------------------------------------------------------------------------
// Skills: [{Acrobatics: 4}, ...] → Record<string, number> + LoreSkillData[]
// ---------------------------------------------------------------------------

function normaliseSkillsArray(
    raw: unknown,
): { skills: Record<string, number>; lore: LoreSkillData[] } {
    const skills: Record<string, number> = {};
    const lore: LoreSkillData[] = [];

    if (Array.isArray(raw)) {
        // Layout format: array of single-key objects
        for (const entry of raw) {
            if (entry && typeof entry === "object") {
                for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
                    const name = key.trim();
                    const mod = Number(val ?? 0);

                    // Detect Lore skills: "Something Lore" or "Lore: Something"
                    const loreMatch = name.match(/^(.+?)\s+Lore$/i) || name.match(/^Lore:\s*(.+)$/i);
                    if (loreMatch) {
                        lore.push({ name: `${loreMatch[1].trim()} Lore`, mod });
                    } else {
                        // Normalise to lowercase slug for standard skills
                        skills[name.toLowerCase()] = mod;
                    }
                }
            }
        }
    } else if (raw && typeof raw === "object") {
        // Legacy format: {acrobatics: 4, ...}
        for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
            skills[key.toLowerCase()] = Number(val ?? 0);
        }
    }

    return { skills, lore };
}

// ---------------------------------------------------------------------------
// Saves: [{fort: 5}, {ref: 8}, {will: 2}] → SavesData
// ---------------------------------------------------------------------------

function normaliseSaves(raw: unknown): SavesData {
    const result: SavesData = { fort: 0, ref: 0, will: 0 };

    if (Array.isArray(raw)) {
        // Layout format: array of single-key objects
        for (const entry of raw) {
            if (entry && typeof entry === "object") {
                for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
                    const k = key.toLowerCase();
                    if (k === "fort" || k === "fortitude") result.fort = Number(val ?? 0);
                    else if (k === "ref" || k === "reflex") result.ref = Number(val ?? 0);
                    else if (k === "will") result.will = Number(val ?? 0);
                    else if (k === "note") result.note = String(val);
                }
            }
        }
    } else if (raw && typeof raw === "object") {
        // Legacy format: {fort: 5, ref: 8, will: 2}
        const obj = raw as Record<string, unknown>;
        result.fort = Number(obj.fort ?? 0);
        result.ref = Number(obj.ref ?? 0);
        result.will = Number(obj.will ?? 0);
        if (obj.note) result.note = String(obj.note);
    }

    return result;
}

// ---------------------------------------------------------------------------
// Speed: "25 feet, fly 60 feet" → SpeedData
// ---------------------------------------------------------------------------

/**
 * Parse a speed string like "25 feet, fly 60 feet, swim 30 feet"
 * into structured SpeedData.
 */
export function parseSpeedString(raw: unknown): SpeedData {
    if (typeof raw === "number") return { land: raw };

    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        // Legacy format: {land: 25, fly: 60}
        const obj = raw as Record<string, unknown>;
        const speed: SpeedData = { land: Number(obj.land ?? 0) };
        if (obj.fly != null) speed.fly = Number(obj.fly);
        if (obj.swim != null) speed.swim = Number(obj.swim);
        if (obj.climb != null) speed.climb = Number(obj.climb);
        if (obj.burrow != null) speed.burrow = Number(obj.burrow);
        if (obj.note) speed.note = String(obj.note);
        return speed;
    }

    const str = String(raw ?? "0").trim();
    if (!str) return { land: 0 };

    const speed: SpeedData = { land: 0 };
    const parts = str.split(/,\s*/);

    for (const part of parts) {
        const trimmed = part.trim().toLowerCase();

        // "fly 60 feet", "swim 30 feet", etc.
        const match = trimmed.match(/^(fly|swim|climb|burrow)\s+(\d+)\s*(?:feet|ft\.?)?$/);
        if (match) {
            const type = match[1] as "fly" | "swim" | "climb" | "burrow";
            speed[type] = Number(match[2]);
            continue;
        }

        // "25 feet" — land speed (first bare number)
        const landMatch = trimmed.match(/^(\d+)\s*(?:feet|ft\.?)?$/);
        if (landMatch) {
            speed.land = Number(landMatch[1]);
        }
    }

    return speed;
}

function normaliseSpeed(raw: unknown): SpeedData {
    return parseSpeedString(raw);
}

// ---------------------------------------------------------------------------
// Attacks: layout format → StrikeData[]
// ---------------------------------------------------------------------------

/**
 * Parse layout-format attacks into StrikeData[].
 *
 * Layout format:
 * ```yaml
 * - name: "__Melee__ ⬻ Mandibles"
 *   bonus: 6
 *   desc: "(finesse, unarmed)"
 *   damage: "1d4+2 piercing"
 * ```
 */
function normaliseAttacks(raw: unknown): StrikeData[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((entry) => {
        const obj = entry as Record<string, unknown>;
        const rawName = String(obj.name ?? "Strike");
        const { type, name } = parseAttackName(rawName);
        const { traits, action, area, range } = parseAttackDesc(String(obj.desc ?? ""));
        const { damage, effects } = parseDamageString(String(obj.damage ?? ""));

        const strike: StrikeData = {
            name,
            type,
            bonus: Number(obj.bonus ?? 0),
            traits,
            damage,
        };

        if (effects.length > 0) strike.effects = effects;
        if (action) strike.action = action;
        if (area) strike.area = area;
        if (range) strike.range = range;

        return strike;
    });
}

/**
 * Parse attack name: "__Melee__ ⬻ Mandibles" → { type: "melee", name: "Mandibles" }
 */
export function parseAttackName(raw: string): { type: "melee" | "ranged"; name: string } {
    let type: "melee" | "ranged" = "melee";
    let name = raw;

    // Remove __Melee__ or __Ranged__ prefix
    const typeMatch = name.match(/^__(\w+)__\s*/);
    if (typeMatch) {
        type = typeMatch[1].toLowerCase() === "ranged" ? "ranged" : "melee";
        name = name.slice(typeMatch[0].length);
    }

    // Remove action icons (⬻ ⬺ ⬽ ⬲ ⭓)
    name = name.replace(/^[⬻⬺⬽⬲⭓]\s*/, "").trim();

    return { type, name };
}

/**
 * Parse attack desc: "(finesse, unarmed)" → traits + optional SF2e extras.
 *
 * Recognises special tokens in the trait list:
 * - "area-fire" / "auto-fire" → action type
 * - "burst N ft." / "cone N ft." / "line N ft." → area
 * - "range N ft." / "range increment N ft." → range
 */
export function parseAttackDesc(raw: string): {
    traits: string[];
    action?: StrikeData["action"];
    area?: { type: string; value: number };
    range?: { increment?: number; max?: number };
} {
    const str = raw.trim();
    // Strip outer parentheses
    const inner = str.replace(/^\(/, "").replace(/\)$/, "").trim();
    if (!inner) return { traits: [] };

    const traits: string[] = [];
    let action: StrikeData["action"] | undefined;
    let area: { type: string; value: number } | undefined;
    let range: { increment?: number; max?: number } | undefined;

    const parts = inner.split(/,\s*/);
    for (const part of parts) {
        const lower = part.trim().toLowerCase();

        // SF2e action types
        if (lower === "area-fire" || lower === "auto-fire") {
            action = lower as StrikeData["action"];
            continue;
        }

        // Area: "burst 5 ft.", "cone 30 ft.", "line 60 ft."
        const areaMatch = lower.match(/^(burst|cone|line|emanation)\s+(\d+)\s*(?:ft\.?|feet)?$/);
        if (areaMatch) {
            area = { type: areaMatch[1], value: Number(areaMatch[2]) };
            continue;
        }

        // Range: "range 70 ft.", "range increment 30 ft."
        const rangeMatch = lower.match(/^range\s+(?:increment\s+)?(\d+)\s*(?:ft\.?|feet)?$/);
        if (rangeMatch) {
            const isIncrement = lower.includes("increment");
            range = isIncrement
                ? { increment: Number(rangeMatch[1]) }
                : { max: Number(rangeMatch[1]) };
            continue;
        }

        traits.push(part.trim().toLowerCase());
    }

    return { traits, action, area, range };
}

/**
 * Parse a damage string like "1d4+2 piercing plus 1d6 fire plus Grab".
 *
 * Returns structured damage rolls and effects (named abilities like Grab).
 */
export function parseDamageString(raw: string): {
    damage: DamageRollData[];
    effects: string[];
} {
    const str = raw.trim();
    if (!str) return { damage: [], effects: [] };

    const damage: DamageRollData[] = [];
    const effects: string[] = [];

    // Split on " plus " (case-insensitive)
    const parts = str.split(/\s+plus\s+/i);

    for (const part of parts) {
        const trimmed = part.trim();
        // Match dice formula: "1d4+2 piercing", "2d6 fire", "1d6 persistent fire"
        const match = trimmed.match(/^(\d+d\d+(?:[+-]\d+)?)\s+(.+)$/);
        if (match) {
            damage.push({
                formula: match[1],
                type: match[2].trim().toLowerCase(),
            });
        } else if (/^\d+d\d+/.test(trimmed)) {
            // Bare dice like "1d6" with no type
            damage.push({ formula: trimmed, type: "untyped" });
        } else {
            // Not a dice formula — it's an effect (e.g. "Grab", "Knockdown")
            effects.push(trimmed);
        }
    }

    return { damage, effects };
}

// ---------------------------------------------------------------------------
// Abilities: [{name, desc, ...}] → AbilityEntry[]
// ---------------------------------------------------------------------------

function normaliseAbilityList(raw: unknown): AbilityEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((a) => {
        const obj = a as Record<string, unknown>;
        const entry: AbilityEntry = {
            name: String(obj.name ?? "Unnamed"),
            desc: String(obj.desc ?? obj.description ?? ""),
        };
        if (obj.traits) entry.traits = toStringArray(obj.traits);
        if (obj.category) entry.category = String(obj.category) as AbilityEntry["category"];
        return entry;
    });
}

// ---------------------------------------------------------------------------
// Spellcasting: layout format → SpellcastingEntry[]
// ---------------------------------------------------------------------------

function normaliseSpellcasting(raw: unknown): SpellcastingEntry[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw.map((entry) => {
        const obj = entry as Record<string, unknown>;
        const result: SpellcastingEntry = {
            name: String(obj.name ?? "Spells"),
            desc: String(obj.desc ?? ""),
        };
        if (obj.dc != null) result.dc = Number(obj.dc);
        if (obj.bonus != null) result.bonus = Number(obj.bonus);
        if (obj.fp != null) result.fp = Number(obj.fp);
        return result;
    });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normaliseString(raw: unknown): string {
    if (raw == null) return "";
    if (Array.isArray(raw)) return raw.filter(Boolean).join(", ");
    const str = String(raw).trim();
    return str;
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.trim() ? [value] : [];
    return [];
}

function normaliseEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
    const str = String(value ?? "").toLowerCase();
    return allowed.includes(str as T) ? (str as T) : fallback;
}

/** Convert a display name to a slug: "Low-Light Vision" → "low-light-vision". */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
}
