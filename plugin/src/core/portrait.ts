const PORTRAIT_LINK = /^!?\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/;

export function normalizePortraitTarget(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const match = PORTRAIT_LINK.exec(trimmed);
    return (match?.[1] ?? trimmed).trim() || undefined;
}
