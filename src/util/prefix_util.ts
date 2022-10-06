import { prefixes } from "../prefixes.json"
import { transforms } from "./transforms";
import { isRDFObject, RDFObject, RDFPropertyValue, TripleEntry } from "./triple";

export function allObjects(
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
    value: string | TripleEntry | RDFObject,
    key: keyof typeof prefixes,
    type: string
) : boolean {
    if (isRDFObject(value)) {
        // cannot be regular object if it is unnamed with custom
        // properties, so not specified object
        return false;
    }
    const tripleEntry = (value instanceof TripleEntry) ? value : TripleEntry.from_any(value);
    const typeInfo : string | string[] = (prefixes as any)[key]["objects"][type];
    if (typeInfo == undefined) {
        console.log(`Warning! The specified type \`${type}\` for prefix \`${key}\` does not exist in the \`prefixes.json\` file.`)
        return false;
    }
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
    values: string | string[] | RDFPropertyValue,
    key: keyof typeof prefixes,
    type: string
) : boolean {
    if (!(values instanceof Array)) {
        return isObject(values, key, type);
    }
    const typeInfo : string | string[] = (prefixes as any)[key]["objects"][type];
    for (const value of values) {
        if (isRDFObject(value)) {
            // cannot be regular object if it is unnamed with custom
            // properties, so not specified object
            continue;
        }
        const tripleEntry = (value instanceof TripleEntry) ? value : TripleEntry.from_any(value);
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

// returns the transform lambda, its function and format (if any)
export function reasonOnPredicate(
    predicate: TripleEntry
) : [((val: string, format: string) => any) | undefined, string | undefined, string | undefined] {
    const info = (prefixes as any)[predicate.prefix]["predicates"]?.[predicate.value];
    if (info) {
        return [
            transforms.get(info.function)!,
            info.function,
            info.format
        ];
    }
    return [
        undefined,
        undefined,
        undefined
    ]
}