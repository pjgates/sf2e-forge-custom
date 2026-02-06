import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Write converted actor entries to the bestiary pack directory.
 *
 * Each creature is written as an individual JSON file named by slug.
 * In dry-run mode, logs what would be written without touching disk.
 */
export async function writeBestiaryPack(
    outputDir: string,
    entries: { slug: string; json: Record<string, unknown> }[],
    dryRun: boolean,
): Promise<void> {
    if (dryRun) {
        console.log(`\n[dry-run] Would write bestiary to: ${outputDir}`);
        for (const entry of entries) {
            console.log(`[dry-run]   ${entry.slug}.json`);
        }
        return;
    }

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Write each creature
    for (const entry of entries) {
        const filePath = path.join(outputDir, `${entry.slug}.json`);
        await writeFile(filePath, JSON.stringify(entry.json, null, 2) + "\n", "utf-8");
    }
}
