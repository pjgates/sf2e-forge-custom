/**
 * Minimal Foundry VTT global type declarations.
 *
 * These provide basic type safety for the most commonly used Foundry globals.
 * For full type coverage, consider using @league-of-foundry-developers/foundry-vtt-types
 * or the types from the pf2e system repo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare const Hooks: {
    on(event: string, callback: (...args: any[]) => void): number;
    once(event: string, callback: (...args: any[]) => void): number;
    off(event: string, id: number): void;
    callAll(event: string, ...args: any[]): boolean;
    call(event: string, ...args: any[]): boolean;
};

declare const game: {
    settings: {
        register(module: string, key: string, data: SettingRegistration): void;
        get(module: string, key: string): unknown;
        set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    modules: Map<string, Module>;
    system: {
        id: string;
        version: string;
    };
    i18n: {
        localize(key: string): string;
        format(key: string, data?: Record<string, unknown>): string;
    };
    user: {
        isGM: boolean;
        id: string;
        name: string;
    };
    actors: WorldCollection<Actor>;
    items: WorldCollection<Item>;
    ready: boolean;
};

declare const ui: {
    notifications: {
        info(message: string, options?: NotificationOptions): void;
        warn(message: string, options?: NotificationOptions): void;
        error(message: string, options?: NotificationOptions): void;
    };
};

declare const CONFIG: Record<string, any>;
declare const canvas: any;
declare const foundry: any;

// ─── Supporting Types ────────────────────────────────────────────────────────

interface SettingRegistration {
    name: string;
    hint?: string;
    scope: "world" | "client";
    config: boolean;
    type: typeof Boolean | typeof Number | typeof String | typeof Object;
    default?: any;
    choices?: Record<string, string>;
    range?: { min: number; max: number; step: number };
    onChange?: (value: any) => void;
    requiresReload?: boolean;
}

interface Module {
    id: string;
    active: boolean;
}

interface NotificationOptions {
    permanent?: boolean;
    localize?: boolean;
}

interface WorldCollection<T> {
    get(id: string): T | undefined;
    getName(name: string): T | undefined;
    contents: T[];
    size: number;
}

declare class Actor {
    id: string;
    name: string;
    type: string;
    system: Record<string, any>;
    items: Collection<Item>;
    update(data: Record<string, any>): Promise<this>;
    getFlag(scope: string, key: string): any;
    setFlag(scope: string, key: string, value: any): Promise<this>;
    unsetFlag(scope: string, key: string): Promise<this>;
}

declare class Item {
    id: string;
    name: string;
    type: string;
    system: Record<string, any>;
    actor: Actor | null;
    update(data: Record<string, any>): Promise<this>;
    getFlag(scope: string, key: string): any;
    setFlag(scope: string, key: string, value: any): Promise<this>;
    unsetFlag(scope: string, key: string): Promise<this>;
}

declare class Collection<T> {
    get(id: string): T | undefined;
    getName(name: string): T | undefined;
    contents: T[];
    size: number;
    filter(predicate: (value: T) => boolean): T[];
    map<U>(transform: (value: T) => U): U[];
    find(predicate: (value: T) => boolean): T | undefined;
}

declare const console: Console;
