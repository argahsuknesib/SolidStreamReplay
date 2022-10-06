import { DataQueryArguments } from "../util/data_query_arguments";
import { TripleEntry, SimpleDataEntry } from "../util/triple";
import { DataSource } from "./data_source";

export class DataManager {
    // buffer groups all properties per subject (first parameter)
    source : DataSource;

    static __data_location_lut = new Map<string, DataManager>();

    private constructor(remote_location: string, type: "remote" | "local") {
        this.source = new DataSource(remote_location, type);
        // the creation of the source automatically fetches data
    }

    static async addLocation(location: string, type: "remote" | "local") {
        DataManager.__data_location_lut.set(location, new DataManager(location, type));
    }

    static hasLocation(location: string) : boolean {
        return DataManager.__data_location_lut.has(location);
    }

    static getExistingData(location: string) {
        return DataManager.__data_location_lut.get(location)
    }

    queryData(args: DataQueryArguments) : any {
        // returns `any` object with structure `subj1: { pred1: [obj1, obj2], pred2: obj3, ... }, ...`
        let result : any = {};
        const databuffer = this.source.data()
        if (databuffer.length == 0) {
            const err = "The requested location has no data available (yet).";
            return {
                "@warning": {
                    "NoData": err
                }
            };
        }
        // if a timestamp is provided, the data is already sorted
        // so its only required to find the bounds inside this buffer
        // where the timestamp is in the requested timeframe
        let startIndex = 0;
        let endIndex = databuffer.length - 1;
        if (databuffer[0]!.sortable()) {
            if (args.start) {
                for (const [i, dataEntry] of databuffer.entries()) {
                    if (dataEntry.sorting_val! > args.start) {
                        startIndex = i;
                        break;
                    }
                }
            }
            if (args.end) {
                // best way to do it in reverse without changing the
                // source array
                for (let i = endIndex; i > startIndex; --i) {
                    const dataEntry = databuffer[i]!;
                    if (dataEntry.sorting_val! < args.end) {
                        endIndex = i;
                        break;
                    }
                }
            }    
        } else if (args.start || args.end) {
            console.log("Sorting required but not available")
            result["@warning"] = { "NotSortable": "Requested data type does not allow sorting, which makes filtering using start-stop not possible" };
        }
        let subbuffer : SimpleDataEntry[] = databuffer.slice(startIndex, endIndex + 1);
        // other filters are applied here (matching subj/pred/...)
        if (args.subj) {
            // every subject gets mapped to a triple entry version
            // so the checks work regardless of notation used in
            // the argument
            const subjects = args.subj.map((original: string) => TripleEntry.from_any(original));
            subbuffer = subbuffer.filter((data: SimpleDataEntry) => {
                return subjects.some((subject: TripleEntry) => data.subj.equals(subject));
            });
        }
        if (args.pred) {
            // the temporary use of the set makes the predicates distinct
            // (except when used in both regular and brief notation, so that could be an issue)
            const requestedPreds = [...new Set(args.pred)].map((original: string) => TripleEntry.from_any(original));
            const existingPreds = subbuffer[0]!.props;
            // boolean array (filter) converting all existing preds to only the requested ones
            const resultingFilter = Array.from({ length: existingPreds.length } , () => (false));
            // TODO: maybe do this on data_source level, or using the data_source
            // predicate LUT instead, as using the first sample is not always possible
            check_preds:
            for (const rPred of requestedPreds) {
                for (const [i, [ePred, _]] of existingPreds.entries()) {
                    if (rPred.equals(ePred)) {
                        resultingFilter[i] = true;
                        continue check_preds;
                    }
                }
                // if not all requested preds can be satisfied, the array becomes empty
                subbuffer.length = 0;
                break;
            }
            subbuffer = subbuffer.map((data: SimpleDataEntry) => {
                return new SimpleDataEntry(
                    data.subj,
                    data.props.filter((_, i: number) => resultingFilter[i])
                );
            });
        }
        if (subbuffer.length == 0) {
            // no samples meet the requirement, adding warning to the result instead
            const err = "The resulting query has no data. Please check the values used for the location and filter arguments";
            if (result["@warning"] == undefined) {
                result["@warning"] = { "NoData": err }
            } else {
                result["@warning"]["NoData"] = err
            }
        } else {
            // the array now has to be transformed into a more parsable query
            // with its layout resembling triples better (see structure above)
            for (const data of subbuffer) {
                const subj = data.subj.get(!args.long);
                result[subj] = {};
                for (const [prop, objs] of data.props) {
                    const objdata = DataManager.objectDataToStr(objs, !args.long);
                    result[subj][prop.get(!args.long)] = objdata;
                }
            }
        }
        return result;
    }

    static objectDataToStr(objs: TripleEntry | TripleEntry[], brief: boolean) : string | number | (string | number)[] {
        if (objs instanceof Array) {
            const result = new Array<string | number>(objs.length);
            for (const [i, obj] of objs.entries()) {
                if (obj.reasonedValue != undefined) {
                    result[i] = obj.reasonedValue;
                } else {
                    result[i] = obj.get(brief);
                }
            }
            return result;
        } else {
            if (objs.reasonedValue != undefined) {
                return objs.reasonedValue;
            } else {
                return objs.get(brief);
            }
        }
    }
}