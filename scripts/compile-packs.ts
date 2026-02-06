#!/usr/bin/env tsx
/**
 * Compile JSON source files in packs/_source/<name>/ into LevelDB
 * databases at packs/<name>/ using the Foundry VTT CLI.
 *
 * Reads pack definitions from module.json so new packs are picked up
 * automatically.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const moduleJsonPath = path.join(rootDir, "module.json");

interface PackDef {
    name: string;
    type: string;
}

const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf-8")) as {
    packs: PackDef[];
};

const packs = moduleJson.packs ?? [];

if (packs.length === 0) {
    console.log("No packs defined in module.json. Nothing to compile.");
    process.exit(0);
}

let compiled = 0;
let skipped = 0;

for (const pack of packs) {
    const sourceDir = path.join(rootDir, "packs", "_source", pack.name);
    const packsDir = path.join(rootDir, "packs");

    if (!existsSync(sourceDir)) {
        console.log(`  Skip: ${pack.name} (no source at packs/_source/${pack.name}/)`);
        skipped++;
        continue;
    }

    console.log(`  Pack: ${pack.name} (${pack.type})`);

    // Remove stale LevelDB to avoid LEVEL_ITERATOR_NOT_OPEN errors on re-pack
    const outDir = path.join(packsDir, pack.name);
    if (existsSync(outDir)) {
        rmSync(outDir, { recursive: true });
    }

    // The CLI creates a subdirectory named after the compendium inside --out,
    // so we point --out at packs/ to get packs/<name>/ as the LevelDB location.
    execSync(
        `npx fvtt package pack ${pack.name} --type Module --in "${sourceDir}" --out "${packsDir}"`,
        { cwd: rootDir, stdio: "inherit" },
    );

    compiled++;
}

console.log(`\nCompiled ${compiled} pack(s)${skipped > 0 ? `, ${skipped} skipped` : ""}.`);
