/**
 * Shared HTML Utilities
 *
 * Helper to normalise the `html` parameter that Foundry hooks pass
 * as either a raw HTMLElement or a jQuery wrapper.
 */

/**
 * Resolve the root HTMLElement from a Foundry hook's `html` parameter.
 * Returns `null` if resolution fails.
 */
export function resolveHtmlRoot(html: JQuery | HTMLElement): HTMLElement | null {
    if (html instanceof HTMLElement) return html;
    // jQuery — index access returns the underlying element
    return (html as JQuery<HTMLElement>)[0] ?? null;
}
