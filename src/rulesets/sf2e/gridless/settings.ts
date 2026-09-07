import { MODULE_ID } from "../../../constants.js";

export function registerGridlessSetting(): void {
    game.settings!.register(MODULE_ID, "gridlessCombat", {
        name: "codex-foundry.settings.gridlessCombat.name",
        hint: "codex-foundry.settings.gridlessCombat.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true,
    });
}

export function isGridlessActive(): boolean {
    return !!canvas?.ready && canvas.grid!.isGridless
        && ["pf2e", "sf2e"].includes(game.system!.id)
        && game.settings!.get(MODULE_ID, "enableCustomRules")
        && game.settings!.get(MODULE_ID, "gridlessCombat");
}
