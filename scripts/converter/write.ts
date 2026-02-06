import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CompendiumFolder } from "./types.js";

/**
 * Write converted journal entries and folder metadata to the pack directory.
 *
 * Each entity is written as an individual JSON file named by slug.
 * Each folder is written as an individual JSON file (folder-<name>.json)
 * so the fvtt CLI can read its `_key` field during pack compilation.
 *
 * In dry-run mode, logs what would be written without touching disk.
 */
export async function writePack(
    outputDir: string,
    entries: { slug: string; json: Record<string, unknown> }[],
    folders: CompendiumFolder[],
    dryRun: boolean,
): Promise<void> {
    if (dryRun) {
        console.log(`\n[dry-run] Would write to: ${outputDir}`);
        console.log(`[dry-run] Folders: ${folders.map((f) => f.name).join(", ")}`);
        for (const entry of entries) {
            console.log(`[dry-run]   ${entry.slug}.json`);
        }
        return;
    }

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Write each folder as an individual JSON file (fvtt CLI needs _key per file)
    for (const folder of folders) {
        const slug = folder.name.toLowerCase().replace(/\s+/g, "-");
        const filePath = path.join(outputDir, `folder-${slug}.json`);
        await writeFile(filePath, JSON.stringify(folder, null, 2) + "\n", "utf-8");
    }

    // Write each entity
    for (const entry of entries) {
        const filePath = path.join(outputDir, `${entry.slug}.json`);
        await writeFile(filePath, JSON.stringify(entry.json, null, 2) + "\n", "utf-8");
    }
}
