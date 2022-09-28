export class DataQueryArguments {
    // epoch - Start time of the range of data samples
    start: number | null = null;
    // epoch - End time of the range of data samples
    end:   number | null = null;
    // exact matches only (but allowing both types of prefix notations)
    subj:  string[] | null = null;
    pred:  string[] | null = null;
    // long parameter:
    // flag - Default brief notation replaces known prefixes
    // with their shorter notation, using an extra
    // @prefix-field with the prefix mapping. When this flag
    // is set however, the prefixes are inserted for every
    // value where possible instead
    long: boolean = false;
    // other filters can be added here as needed...

    static from(obj: any): DataQueryArguments {
        // convert types and see if they are valid
        const subjects = typeof obj.subj === "string" && obj.subj.startsWith("[") && obj.subj.endsWith("]") ? obj.subj.substring(1, obj.subj.length - 1).split(",") : null;
        const predicates = typeof obj.pred === "string" && obj.pred.startsWith("[") && obj.pred.endsWith("]") ? obj.pred.substring(1, obj.pred.length - 1).split(",") : null;
        return {
            start  : obj.start != undefined ? obj.start  : null,
            end    : obj.end   != undefined ? obj.end    : null,
            subj   : subjects,
            pred   : predicates,
            long   : obj.long  != undefined ? obj.long   : false
        };
    }
}
