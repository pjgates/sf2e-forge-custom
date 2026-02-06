import type { SlugMap } from "./types.js";

const MODULE_ID = "sf2e-forge-custom";

/**
 * Regex matching Obsidian-style wikilinks: [[target|Display Text]] or [[target]]
 * Also handles fragment anchors: [[target#heading|Display Text]]
 */
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?([^\]]*)\]\]/g;

/**
 * Resolve wikilinks in markdown text using the slug-to-ID map.
 *
 * - If the target slug matches a known entity, replaces with a Foundry
 *   compendium UUID link: @UUID[Compendium.module.pack.id]{Display Text}
 * - If no match, renders as plain text using the display text.
 * - Fragment anchors (e.g. [[slug#heading|text]]) are dropped since
 *   Foundry journal compendium links don't support them.
 *
 * This runs BEFORE markdown-to-HTML conversion, so the @UUID syntax
 * is preserved through the markdown renderer as-is.
 */
export function resolveWikilinks(
    markdown: string,
    slugMap: SlugMap,
    packName: string,
): string {
    return markdown.replace(WIKILINK_RE, (_match, rawTarget: string, displayText: string) => {
        // Extract just the slug portion (strip path prefixes like "the-forge/")
        const targetSlug = rawTarget.trim().split("/").pop() ?? rawTarget.trim();
        const display = displayText.trim() || targetSlug;
        const id = slugMap.get(targetSlug);

        if (id) {
            return `@UUID[Compendium.${MODULE_ID}.${packName}.${id}]{${display}}`;
        }

        // No match — render as plain text
        return display;
    });
}
