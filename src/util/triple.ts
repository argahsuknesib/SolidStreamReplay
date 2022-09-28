import { prefixes } from "../prefixes.json";
import { transforms } from "./transforms";

export class TripleEntry {
    // Represents an entry found for either subj, pred or obj
    // with its value being either a substring of the original,
    // or the original value itself depending on wether or not
    // a known prefix is used (which can be found and mapped
    // using the index)
    value : string;
    prefixIndex : number;
    // When object parsing is enabled on an entry, the prefix
    // table is used to determine wether or not the raw value
    // can be interpreted as well. If that is the case, it is
    // set here
    reasonedValue : any | undefined;
    function : string | undefined;

    constructor(val: string, pIndex: number) {
        this.value = val;
        this.prefixIndex = pIndex;
    }

    static from_any(rawValue: string) : TripleEntry {
        // if the prefix is known in the prefixes.json file, the
        // prefix gets removed from the original string (=substr),
        // and the found prefix index gets returned alongside it;
        // otherwise, the full value and index -1 are returned,
        // indicating no prefixes match
        let prefixIndex = -1;
        let value = rawValue.trim();
        for (const [i, prefix] of prefixes.entries()) {
            if (value.startsWith(prefix.name)) {
                prefixIndex = i;
                value = value.substring(prefix.name.length);
                break;
            } else if (value.startsWith(prefix.value)) {
                prefixIndex = i;
                value = value.substring(prefix.value.length);
                break;
            }
        }
        return new TripleEntry(value, prefixIndex);
    }

    static from(rawValue: string, brief: boolean = false) : TripleEntry {
        // if the prefix is known in the prefixes.json file, the
        // prefix gets removed from the original string (=substr),
        // and the found prefix index gets returned alongside it;
        // otherwise, the full value and index -1 are returned,
        // indicating no prefixes match
        const i = this.getPrefixIndex(rawValue, brief);
        if (i != -1) {
            return new TripleEntry(rawValue.substring(prefixes[i][brief ? "name" : "value"].length), i);
        }
        // nothing found, no known prefix can be applied
        return new TripleEntry(rawValue, -1);
    }

    static from_object(rawValue: string, predicateInfo: TripleEntry, brief: boolean = false) {
        // the same method as regular from(), but takes extra
        // corresponding predicate info to parse the object by
        // its type first, and as a regular entry otherwise
        const i = predicateInfo.prefixIndex;
        const special: any | undefined = i == -1 ? undefined : prefixes[i].special;
        if (special) {
            const specialTypeInfo : any | undefined = special[predicateInfo.value];
            if (specialTypeInfo) {
                const transform = transforms.get(specialTypeInfo.function);
                if (transform) {
                    const result = new TripleEntry(rawValue, -1);
                    result.reasonedValue = transform(rawValue, specialTypeInfo["format"]);
                    result.function = specialTypeInfo.function;
                    return result;
                } else {
                    console.warn(`Unrecognized transform type in data: '${specialTypeInfo.function}'`)
                }
            }
        }
        // predicate info was not useful, using regular approach
        return this.from(rawValue, brief);
    }

    get(brief: boolean = true) : string {
        // returns the brief representation of this entry
        if (this.prefixIndex != -1) {
            return (
                prefixes[this.prefixIndex][brief ? "name" : "value"] +
                this.value
            );
        }
        return this.value;
    }

    equals(other: TripleEntry): boolean {
        // only prefix & value are checked for two reasons:
        // 1: function and reasonedValue are derived from value
        // 2: only object type entries have these members populated,
        // meaning that a (temporary) subject and object could
        // otherwise never be considered equal, even if they represent
        // the same value
        return this.prefixIndex === other.prefixIndex
            && this.value === other.value;
    }

    static getPrefixIndex(value: string, brief: boolean): number {
        const arg = brief? "name" : "value";
        for (const [i, prefix] of prefixes.entries()) {
            if (value.startsWith(prefix[arg])) {
                return i;
            }
        }
        return -1;
    }

    // transform "lambdas"
    static longToBrief(original: string): [string, number] {
        // returns both the transformed prefix string,
        // as well as the prefix index
        const entry = TripleEntry.from(original, false);
        return [entry.get(true), entry.prefixIndex];
    }

    static briefToLong(original : string): [string, number] {
        // returns the longer version of the triple, as well
        // as its prefix index
        const entry = TripleEntry.from(original, true);
        return [entry.get(false), entry.prefixIndex];
    }

    // debug method
    print() {
        console.log(`TripleEntry - { ${this.value} - ${this.prefixIndex} - ${this.reasonedValue} - ${this.function} }`)
    }
}

export class Triple {
    s: TripleEntry;
    p: TripleEntry;
    o: TripleEntry;

    constructor(_s: TripleEntry, _p: TripleEntry, _o: TripleEntry) {
        this.s = _s;
        this.p = _p;
        this.o = _o;
    }

    static fromString(_s: string, _p: string, _o: string, brief: boolean) : Triple {
        const pred = TripleEntry.from(_p, brief);
        return new Triple(
            TripleEntry.from(_s, brief),
            pred,
            TripleEntry.from_object(_o, pred, brief)
        );
    }

    static fromQuad(quad: any, brief: boolean) : Triple {
        return Triple.fromString(
            quad.subject.value,
            quad.predicate.value,
            quad.object.value,
            brief
        )
    }
}

export class DataEntry {
    
    subj : TripleEntry;
    props : [TripleEntry, TripleEntry | TripleEntry[]][]
    sorting_val : number | undefined

    constructor(
        subj: TripleEntry,
        props: [TripleEntry, TripleEntry | TripleEntry[]][],
        sortingPredicateIndex: number | undefined = undefined
    ) {
        this.subj = subj;
        this.props = props;
        // if there is a sorting predicate available, use its
        // objects' reasoned value as sorting value
        if (sortingPredicateIndex) {
            this.sorting_val = (
                // assert in data_source should require this to be a single
                // entry, not an array, so casting should always work
                this.props[sortingPredicateIndex][1] as TripleEntry
            ).reasonedValue;
        }
    }

    sortable() : boolean {
        return this.sorting_val != undefined;
    }

}
