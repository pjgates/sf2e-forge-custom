export interface RevealState {
    isRevealed(path: string): boolean;
    setRevealed(path: string, revealed: boolean): void;
    subscribe(path: string, handler: () => void): () => void;
}

/** Session-only reveal state — never persisted to disk or frontmatter. */
export class SessionRevealState implements RevealState {
    private readonly revealedPaths = new Set<string>();
    private readonly handlersByPath = new Map<string, Set<() => void>>();

    isRevealed(path: string): boolean {
        return this.revealedPaths.has(path);
    }

    subscribe(path: string, handler: () => void): () => void {
        const handlers = this.handlersByPath.get(path) ?? new Set<() => void>();
        this.handlersByPath.set(path, handlers);
        handlers.add(handler);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) this.handlersByPath.delete(path);
        };
    }

    setRevealed(path: string, revealed: boolean): void {
        if (this.isRevealed(path) === revealed) return;
        if (revealed) this.revealedPaths.add(path);
        else this.revealedPaths.delete(path);
        for (const handler of [...(this.handlersByPath.get(path) ?? [])]) handler();
    }
}
