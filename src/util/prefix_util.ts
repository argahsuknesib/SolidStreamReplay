import { prefixes } from "../prefixes.json"
import { TripleEntry } from "./triple";

export function object(
    key: keyof typeof prefixes,
    type: string,
    brief: boolean = false
) : string[] {
    const typeInfo : string | string[] = (prefixes as any)[key]["objects"][type];
    const _prefix = (brief ? key : prefixes[key].value);
    if (typeInfo instanceof Array) {
        const result = new Array<string>(typeInfo.length);
        for (const [i, _type] of typeInfo.entries()) {
            result[i] = _prefix + _type;
        }
        return result;
    } else {
        return new Array(_prefix + typeInfo);
    }
}

export function isObject(
    value: string,
    key: keyof typeof prefixes,
    type: string
) : boolean {
    const tripleEntry = TripleEntry.from_any(value);
    const typeInfo : string | string[] = (prefixes as any)[key]["objects"][type];
    if (tripleEntry.prefix !== key) {
        return false;
    }
    if (typeInfo instanceof Array) {
        for (const _type of typeInfo) {
            if (tripleEntry.value === _type) {
                return true;
            }
        }
        return false;
    } else {
        return tripleEntry.value === typeInfo;
    }
}

export function anyIsObject(
    values: string[],
    key: keyof typeof prefixes,
    type: string
) : boolean {
    const typeInfo : string | string[] = (prefixes as any)[key]["objects"][type];
    for (const value of values) {
        const tripleEntry = TripleEntry.from_any(value);
        if (tripleEntry.prefix !== key) {
            continue;
        }
        if (typeInfo instanceof Array) {
            for (const _type of typeInfo) {
                if (tripleEntry.value === _type) {
                    return true;
                }
            }
        } else {
            if (tripleEntry.value === typeInfo) {
                return true;
            }
        }
    }
    return false;
}