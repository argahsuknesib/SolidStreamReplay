import assert from "assert";
import { prefixes } from "../prefixes.json";
import { reasonOnPredicate } from "./prefix_util";
import { Comparable } from "./sorted_array";

export class TripleEntry {
    // Represents an entry found for either subj, pred or obj
    // with its value being either a substring of the original,
    // or the original value itself depending on wether or not
    // a known prefix is used (which can be found and mapped
    // using the index)
    value : string;
    prefix : keyof typeof prefixes;
    // When object parsing is enabled on an entry, the prefix
    // table is used to determine wether or not the raw value
    // can be interpreted as well. If that is the case, it is
    // set here
    reasonedValue : any | undefined;
    function : string | undefined;

    constructor(val: string, prefix: keyof typeof prefixes) {
        this.value = val;
        this.prefix = prefix;
    }

    static from_any(value: string) : TripleEntry {
        // if the prefix is known in the prefixes.json file, the
        // prefix gets removed from the original string (=substr),
        // and the found prefix index gets returned alongside it;
        // otherwise, the full value and index -1 are returned,
        // indicating no prefixes match
        value = value.trim();
        let prefix: keyof typeof prefixes;
        for (prefix in prefixes) {
            if (value.startsWith(prefix)) {
                return new TripleEntry(value.substring(prefix.length), prefix);
            } else if (value.startsWith(prefixes[prefix].value)) {
                return new TripleEntry(value.substring(prefixes[prefix].value.length), prefix);
            }
        }
        return new TripleEntry(value, "<unknown>");
    }

    static from(value: string, brief: boolean = false) : TripleEntry {
        // if the prefix is known in the prefixes.json file, the
        // prefix gets removed from the original string (=substr),
        // and the found prefix index gets returned alongside it
        value = value.trim();
        if (brief) {
            let prefix: keyof typeof prefixes;
            for (prefix in prefixes) {
                if (value.startsWith(prefix)) {
                    return new TripleEntry(value.substring(prefix.length), prefix);    
                }
            }
        } else {
            let prefix: keyof typeof prefixes;
            for (prefix in prefixes) {
                if (value.startsWith(prefixes[prefix].value))
                    return new TripleEntry(value.substring(prefixes[prefix].value.length), prefix);
            }
        }
        // nothing found, no known prefix can be applied
        return new TripleEntry(value, "<unknown>");
    }

    static from_object(value: string, predicateType: TripleEntry, brief: boolean = false) {
        // the same method as regular from(), but takes extra
        // corresponding predicate info to parse the object by
        // its type first, and as a regular entry otherwise
        value = value.trim();
        const [transform, func, format] = reasonOnPredicate(predicateType);
        if (transform) {
            // value is reasoned on directly, so no prefix
            const result = new TripleEntry(value, "<unknown>");
            result.reasonedValue = transform(value, format!);
            result.function = func;
            return result;
        } else if (func) {
            console.log(`Unsupported transform type \`${func}\`.`);
        }
        // predicate info was not useful, using regular approach
        return this.from(value, brief);
    }

    get(brief: boolean = true) : string {
        // returns the brief representation of this entry
        return this.prefix === "<unknown>"
            ? this.value
            : ((brief
                ? this.prefix
                : prefixes[this.prefix].value
            ) + this.value);
    }

    equals(other: TripleEntry): boolean {
        // only prefix & value are checked for two reasons:
        // 1: function and reasonedValue are derived from value
        // 2: only object type entries have these members populated,
        // meaning that a (temporary) subject and object could
        // otherwise never be considered equal, even if they represent
        // the same value
        return this.prefix === other.prefix
            && this.value === other.value;
    }

    // debug method
    print() {
        console.log(`TripleEntry - { ${this.value} - ${this.prefix} - ${this.reasonedValue} - ${this.function} }`)
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

    static fromBinding(binding: any) : Triple {
        // bindings come from Comunica, and are thus
        // not brief
        return Triple.fromString(
            binding.get("s").value,
            binding.get("p").value,
            binding.get("o").value,
            false
        )
    }
}

export class SimpleDataEntry implements Comparable {
    
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

    cmp(other: SimpleDataEntry) : number {
        // returns equals (= 0) when sorting val is undefined
        if (this.sorting_val && other.sorting_val) {
            return this.sorting_val - other.sorting_val;
        }
        return 0;
    }

    equals(other: SimpleDataEntry) : boolean {
        return this.cmp(other) == 0
            && this.subj.equals(other.subj)
            && this.props.every(([pred, val], i) => {
                return pred.equals(other.props[i][0]) && (
                    (val instanceof Array
                        && val.every((val, j) => {
                            return val.equals((other.props[i][1] as TripleEntry[])[j]);
                        })
                    ) || (
                        val instanceof TripleEntry
                        && val.equals(other.props[i][1] as TripleEntry)
                    ))
            })
    }

    sortable() : boolean {
        return this.sorting_val != undefined;
    }

}

// converting triples belonging to the same object to a more usable
// version
export interface RDFObject {
    subj: TripleEntry
    props: [TripleEntry, TripleEntry | RDFObject | (TripleEntry | RDFObject)[]][]

    get(predicate: TripleEntry) : RDFPropertyValue | undefined;
    print() : void;
}

export function isRDFObject(object: any) : object is RDFObject {
    return "subj" in object && "props" in object;
}

// the property value type could now be any of the three possible types
// therefore, a generic typename is specified
export type RDFPropertyValue = TripleEntry | RDFObject | (TripleEntry | RDFObject)[]

// type representing the properties a temporary/unnamed subject has
// (for example a Tree#Relationship, an object that is typically temporary in name,
// as only its properties are relevant)
export class UnnamedObj implements RDFObject {

    // subj; as sometimes these values are also used
    subj: TripleEntry
    // the property values could either be regular types, or other unnamed objects
    props: [TripleEntry, TripleEntry | UnnamedObj | (TripleEntry | UnnamedObj)[]][]

    constructor(
        props: [TripleEntry, TripleEntry | UnnamedObj | (TripleEntry | UnnamedObj)[]][],
        subj: TripleEntry
    ) {
        this.props = props;
        this.subj = subj
    }

    static fromTriple(triple: Triple) : UnnamedObj {
        // subject doesnt necessarily matter, only its property and object
        return new UnnamedObj(new Array([triple.p, triple.o]), triple.s);
    }

    addTriple(triple: Triple) {
        // subject should match, won't check here however
        // if the predicate already exists, make its object either an array
        // or add to the array if it already is one
        for (const [i, [prop, val]] of this.props.entries()) {
            if (prop.equals(triple.p)) {
                // if already an array, add it, otherwise, make array and add
                // existing value as well as the new one
                if (val instanceof Array) {
                    val.push(triple.o);
                } else {
                    this.props[i][1] = new Array(val, triple.o);
                }
                return;
            }
        }
        // nothing found, adding prop
        this.props.push([triple.p, triple.o]);
    }

    setUnnamed(tempSubject: string, value: UnnamedObj) {
        // every object instance (at any depth) having the tempSubject as value
        // gets replaced with its contents (=value)
        UnnamedObj.__set_unnamed(this.props, tempSubject, value);
    }

    // static helper method setting the unnamed object
    // instances found in props matching the temporary
    // subject's name to its properties
    // this works recursively for the properties of unnamed objects,
    // so all levels get affected
    static __set_unnamed(
        props: [TripleEntry, RDFPropertyValue][],
        tempSubject: string,
        value: UnnamedObj
    ) {
        for (const [i, [_, val]] of props.entries()) {
            // the value could simply be this tempSubject's value,
            // a list containing this value
            if (val instanceof TripleEntry) {
                if (val.value === tempSubject) {
                    props[i][1] = value;
                }
            } else if (isRDFObject(val)) {
                // recursive operation
                UnnamedObj.__set_unnamed(val.props, tempSubject, value);
            } else {
                // array, repeating the branches above
                for (const [j, entry] of val.entries()) {
                    if (entry instanceof TripleEntry) {
                        if (entry.value === tempSubject) {
                            (props[i][1] as (TripleEntry | UnnamedObj)[])[j] = value;
                        }
                    } else {
                        // entry instanceof UnnamedObj
                        // recursive operation
                        UnnamedObj.__set_unnamed(entry.props, tempSubject, value);
                    }
                }
            }
        }
    }

    // recursive print
    static __print(
        props: [TripleEntry, RDFPropertyValue][],
        currentDepth: number = 0,
    ) {
        const printPrefix = ' ' + '  '.repeat(currentDepth);
        for (const [prop, val] of props) {
            // if (prop.equals(new TripleEntry("relation", "tree:"))) {

            // }
            if (val instanceof TripleEntry) {
                console.log(printPrefix + `${prop.get()} - ${val.get()}`);
            } else if (isRDFObject(val)) {
                console.log(printPrefix + `${prop.get()} (${val.subj?.get()}) {`);
                UnnamedObj.__print(val.props, currentDepth + 1);
                console.log(printPrefix + "}");
            } else {
                // array of either TripleEntries or UnnamedObjs
                console.log(printPrefix + `${prop.get()} [`);
                for (const [i, subval] of val.entries()) {
                    if (subval instanceof TripleEntry) {
                        console.log(printPrefix + `  ${i}: '${subval.get()}'`);
                    } else {
                        // unnamed obj
                        console.log(printPrefix + `  ${i} (${subval.subj?.get()}) {`)
                        UnnamedObj.__print(subval.props, currentDepth + 3);
                        console.log(printPrefix + '  }');
                    }        
                }
                console.log(printPrefix + `]`);
            }
        }
    }

    get(predicate: TripleEntry) : RDFPropertyValue | undefined {
        // linear search unfortunately
        for (const [pred, val] of this.props) {
            if (pred.equals(predicate)) {
                return val;
            }
        }
        return undefined;
    }

    print() {
        console.log(`UnnamedObj - ${this.subj.get(true)}`);
        UnnamedObj.__print(this.props);
    }

}

export class DataEntry implements RDFObject {

    subj: TripleEntry;
    props : [TripleEntry, RDFPropertyValue][]

    constructor(
        subj: TripleEntry,
        props: [TripleEntry, RDFPropertyValue][]
    ) {
        this.subj = subj;
        this.props = props;
    }

    static fromTriple(triple: Triple) : DataEntry {
        // only one pred and obj, so simple props
        return new DataEntry(triple.s, new Array([triple.p, triple.o]));
    }

    addTriple(triple: Triple) {
        assert(triple.s.equals(this.subj), "Subjects should match when adding triple properties to DataEntry!");
        // similar to how unnamedobj does it
        // if the predicate already exists, make its object either an array
        // or add to the array if it already is one
        for (const [i, [prop, val]] of this.props.entries()) {
            if (prop.equals(triple.p)) {
                // if already an array, add it, otherwise, make array and add
                // existing value as well as the new one
                if (val instanceof Array) {
                    val.push(triple.o);
                } else {
                    this.props[i][1] = new Array(val, triple.o);
                }
                return;
            }
        }
        // nothing found, adding prop
        this.props.push([triple.p, triple.o]);
    }

    setUnnamed(tempSubj: string, value: UnnamedObj) {
        // similar method to the one found in UnnamedObj
        UnnamedObj.__set_unnamed(this.props, tempSubj, value);
    }

    print() {
        console.log(`DataEntry - ${this.subj.get(true)}`);
        UnnamedObj.__print(this.props);
    }

    static fromTriples(triples: Triple[]) : DataEntry[] {
        // a triple's subject counts as temporary when its
        // used as an object somewhere, so getting all
        // object values in a set first
        const objs = new Set<string>();
        for (const triple of triples) {
            objs.add(triple.o.value);
        }
        // splitting all temps from the array into
        // a map with the key being its temporary name, and putting
        // the permanent ones in the result map
        const tempObjs = new Map<string, UnnamedObj>()
        // result is first a map, where its values are the result
        // and the keys are the non-temp subjects they have
        const result = new Map<string, DataEntry>();
        for (const triple of triples) {
            if (objs.has(triple.s.value)) {
                // temp type, adding to map if needed, otherwise adding
                // the triple
                if (!tempObjs.has(triple.s.value)) {
                    tempObjs.set(triple.s.value, UnnamedObj.fromTriple(triple));
                } else {
                    tempObjs.get(triple.s.value)!.addTriple(triple);
                }
            } else {
                // not temp, keeping in results
                // the subject might already be present in the
                // result map, so finding that one first
                if (result.has(triple.s.value)) {
                    result.get(triple.s.value)!.addTriple(triple);
                } else {
                    result.set(triple.s.value, DataEntry.fromTriple(triple));
                }
            }
        }
        // objs no longer needed
        objs.clear();
        // first, all unnameds get their own temp object values set to their unnamed versions
        for (const [currentSubj, unnamedObj] of tempObjs) {
            for (const [tempSubj, unnamedValue] of tempObjs) {
                // subject names should not match (will happen once every iteration, as the
                // keys aren't that easily (temporarily) manipulated)
                if (currentSubj === tempSubj) {
                    continue;
                }
                unnamedObj.setUnnamed(tempSubj, unnamedValue);
            }    
        }
        // now these can all be substituted in the resulting map
        for (const [_, resultEntries] of result) {
            for (const [tempSubj, unnamedValue] of tempObjs) {
                resultEntries.setUnnamed(tempSubj, unnamedValue);
            }
        }
        return Array.from(result.values());
    }

    get(predicate: TripleEntry) : RDFPropertyValue | undefined {
        // linear search unfortunately
        for (const [pred, val] of this.props) {
            if (pred.equals(predicate)) {
                return val;
            }
        }
        return undefined;
    }

}
