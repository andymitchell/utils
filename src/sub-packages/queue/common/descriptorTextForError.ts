import type { BaseItem } from "../types.ts";

export function descriptorTextForError(descriptor?: BaseItem['descriptor'] | null):string {

    const descriptorConsistent = descriptor ?? undefined; // null should resolve to undefined
    return ` [descriptor: ${descriptorConsistent}]`;

}