export interface AttackItem {
    name: string;
    isMelee?: boolean;
    reach?: number | null;
    range?: { increment: number | null; max: number } | null;
}

export interface PreparedAttack {
    label: string;
    ready: boolean;
    visible?: boolean;
    item: AttackItem;
    altUsages?: readonly PreparedAttack[];
}

export interface AttackActor {
    system: { actions?: readonly PreparedAttack[] };
    getReach(context: { action: "attack"; weapon: AttackItem }): number;
}

export interface AttackRange {
    kind: "reach" | "range";
    distance: number;
    label: string;
}

/** Prepared readiness covers equipped weapons, usable alternate grips, and natural attacks. */
export function getAttackRanges(actor: AttackActor | null): AttackRange[] {
    const groups = new Map<string, { kind: AttackRange["kind"]; distance: number; names: string[] }>();
    const add = (attack: PreparedAttack): void => {
        if (!attack.ready || attack.visible === false) return;
        const range = attack.item.range;
        const kind = range ? "range" : attack.item.isMelee ? "reach" : null;
        if (!kind) return;
        const distance = range ? (range.increment ?? range.max) : (attack.item.reach ?? actor!.getReach({ action: "attack", weapon: attack.item }));
        const key = `${kind}:${distance}`;
        const group = groups.get(key);
        if (group) {
            if (!group.names.includes(attack.label)) group.names.push(attack.label);
        } else groups.set(key, { kind, distance, names: [attack.label] });
    };
    for (const attack of actor?.system.actions ?? []) {
        add(attack);
        for (const alternate of attack.altUsages ?? []) add(alternate);
    }
    return Array.from(groups.values(), ({ kind, distance, names }) => ({ kind, distance, label: names.join(", ") }))
        .sort((a, b) => b.distance - a.distance || Number(a.kind === "range") - Number(b.kind === "range"));
}
