#!/usr/bin/env tsx
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { buildActorDocument } from "./converter/bestiary-actor.js";
import { parseCreature } from "./converter/bestiary-parse.js";
import type { ParsedCreature } from "./converter/bestiary-types.js";
import { writeBestiaryPack } from "./converter/bestiary-write.js";
import { buildFolders, getFolderId } from "./converter/folders.js";
import { generateId } from "./converter/ids.js";
import { buildJournalEntry } from "./converter/journal.js";
import { resolveWikilinks } from "./converter/links.js";
import { markdownToHtml } from "./converter/markdown.js";
import { parseEntity } from "./converter/parse.js";
import type { ConvertedEntity, ConverterOptions, ParsedEntity, SlugMap } from "./converter/types.js";
import { writePack } from "./converter/write.js";

const ENTITIES_PACK = "the-forge-entities";
const BESTIARY_PACK = "the-forge-bestiary";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command()
    .name("convert-vault")
    .description("Convert vault markdown entities and bestiary into Foundry VTT compendium JSON")
    .option("--campaign <name>", "Campaign subfolder name", "the-forge")
    .option("--include-unpublished", "Include entities with published: false", false)
    .option("--dry-run", "Show what would be converted without writing files", false)
    .parse();

const opts = program.opts<ConverterOptions>();

await convertEntities(opts);
await convertBestiary(opts);

// ---------------------------------------------------------------------------
// Entity Pipeline
// ---------------------------------------------------------------------------

async function convertEntities(options: ConverterOptions): Promise<void> {
    const rootDir = path.resolve(import.meta.dirname, "..");
    const entitiesDir = path.join(rootDir, "vault", "codex", options.campaign, "entities");
    const outputDir = path.join(rootDir, "packs", "_source", ENTITIES_PACK);

    // Discover markdown files
    let filenames: string[];
    try {
        const entries = await readdir(entitiesDir);
        filenames = entries.filter((f) => f.endsWith(".md")).sort();
    } catch {
        console.error(`Error: entities directory not found: ${entitiesDir}`);
        console.error("Make sure the vault submodule is initialised: git submodule update --init");
        process.exit(1);
    }

    if (filenames.length === 0) {
        console.log("No markdown files found. Nothing to convert.");
        return;
    }

    // -----------------------------------------------------------------------
    // Pass 1: Parse all entities, filter by published, build slug map
    // -----------------------------------------------------------------------

    const allParsed: ParsedEntity[] = [];
    for (const filename of filenames) {
        const raw = await readFile(path.join(entitiesDir, filename), "utf-8");
        allParsed.push(parseEntity(filename, raw));
    }

    const included = options.includeUnpublished
        ? allParsed
        : allParsed.filter((e) => e.frontmatter.published);

    const skipped = allParsed.length - included.length;

    // Build slug → ID map from ALL parsed entities (including skipped)
    // so wikilinks to unpublished entities can still be resolved if desired
    const slugMap: SlugMap = new Map();
    for (const entity of allParsed) {
        slugMap.set(entity.slug, generateId(entity.slug));
    }

    // -----------------------------------------------------------------------
    // Pass 2: Convert markdown → HTML with resolved links, build output
    // -----------------------------------------------------------------------

    const converted: ConvertedEntity[] = [];
    for (const entity of included) {
        const playerMarkdown = resolveWikilinks(entity.playerContent, slugMap, ENTITIES_PACK);
        const playerHtml = markdownToHtml(playerMarkdown);

        let gmHtml: string | null = null;
        if (entity.gmContent !== null) {
            const gmMarkdown = resolveWikilinks(entity.gmContent, slugMap, ENTITIES_PACK);
            gmHtml = markdownToHtml(gmMarkdown);
        }

        converted.push({
            slug: entity.slug,
            id: slugMap.get(entity.slug)!,
            name: entity.frontmatter.title,
            frontmatter: entity.frontmatter,
            playerHtml,
            gmHtml,
            folderId: getFolderId(entity.frontmatter.type),
        });
    }

    // Build folder metadata from included entities
    const folders = buildFolders(included);

    // Build JournalEntry JSON for each entity
    const entries = converted.map((entity) => ({
        slug: entity.slug,
        json: buildJournalEntry(entity),
    }));

    // -----------------------------------------------------------------------
    // Write output
    // -----------------------------------------------------------------------

    await writePack(outputDir, entries, folders, options.dryRun);

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------

    const total = allParsed.length;
    const convertedCount = included.length;
    const skipMsg = skipped > 0 ? ` (${skipped} skipped: unpublished)` : "";
    const modeMsg = options.dryRun ? " [dry-run]" : "";

    console.log(`\nEntities: ${convertedCount}/${total}${skipMsg}${modeMsg}`);
    console.log(`  Pack: ${ENTITIES_PACK}`);
    console.log(`  Folders: ${folders.map((f) => f.name).join(", ")}`);
    if (!options.dryRun) {
        console.log(`  Output: ${outputDir}`);
    }
}

// ---------------------------------------------------------------------------
// Bestiary Pipeline
// ---------------------------------------------------------------------------

async function convertBestiary(options: ConverterOptions): Promise<void> {
    const rootDir = path.resolve(import.meta.dirname, "..");
    const bestiaryDir = path.join(rootDir, "vault", "codex", options.campaign, "bestiary");
    const outputDir = path.join(rootDir, "packs", "_source", BESTIARY_PACK);

    // Discover markdown files
    let filenames: string[];
    try {
        const entries = await readdir(bestiaryDir);
        filenames = entries.filter((f) => f.endsWith(".md")).sort();
    } catch {
        // Bestiary directory is optional — silently skip if not present
        return;
    }

    if (filenames.length === 0) {
        return;
    }

    // Parse all creature files
    const allParsed: ParsedCreature[] = [];
    for (const filename of filenames) {
        const raw = await readFile(path.join(bestiaryDir, filename), "utf-8");
        const creature = parseCreature(filename, raw);
        if (creature) {
            allParsed.push(creature);
        }
    }

    // Filter by published
    const included = options.includeUnpublished
        ? allParsed
        : allParsed.filter((c) => c.statblock.published);

    const skipped = allParsed.length - included.length;

    // Build actor JSON for each creature
    const entries = included.map((creature) => ({
        slug: creature.slug,
        json: buildActorDocument(creature),
    }));

    // Write output
    await writeBestiaryPack(outputDir, entries, options.dryRun);

    // Summary
    const total = allParsed.length;
    const convertedCount = included.length;
    const skipMsg = skipped > 0 ? ` (${skipped} skipped: unpublished)` : "";
    const modeMsg = options.dryRun ? " [dry-run]" : "";

    console.log(`\nBestiary: ${convertedCount}/${total}${skipMsg}${modeMsg}`);
    console.log(`  Pack: ${BESTIARY_PACK}`);
    if (!options.dryRun && convertedCount > 0) {
        console.log(`  Output: ${outputDir}`);
    }
}
