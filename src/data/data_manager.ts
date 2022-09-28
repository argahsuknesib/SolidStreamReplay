import { DataQueryArguments } from "../util/data_query_arguments";
import { TripleEntry, DataEntry } from "../util/triple";
import { DataSource } from "./data_source";

export class DataManager {
    // buffer groups all properties per subject (first parameter)
    source : DataSource;

    static __data_location_lut = new Map<string, DataManager>();

    private constructor(remote_location: string) {
        this.source = new DataSource(remote_location);
        // the creation of the source automatically fetches data
    }

    static async addLocation(location: string) {
        DataManager.__data_location_lut.set(location, new DataManager(location));
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
        // if a timestamp is provided, the data is already sorted
        // so its only required to find the bounds inside this buffer
        // where the timestamp is in the requested timeframe
        let startIndex = 0;
        const databuffer = this.source.data()
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
        let subbuffer : DataEntry[] = databuffer.slice(startIndex, endIndex + 1);
        // other filters are applied here (matching subj/pred/...)
        if (args.subj) {
            // every subject gets mapped to a triple entry version
            // so the checks work regardless of notation used in
            // the argument
            const subjects = args.subj.map((original: string) => TripleEntry.from_any(original));
            subbuffer = subbuffer.filter((data: DataEntry) => {
                return subjects.some((subject: TripleEntry) => data.subj.equals(subject));
            });
        }
        if (args.pred) {
            // here, entries are kept, but their properties
            // are filtered upon
            // the new data entries do not get their sorting
            // index set, as this is no longer required (source array
            // is already sorted)
            const predicates = args.pred.map((original: string) => TripleEntry.from_any(original));
            subbuffer = subbuffer.map((data: DataEntry) => {
                return new DataEntry(
                    data.subj,
                    data.props.filter(
                        ([prop, _]) => predicates.some(
                            (predicate) => predicate.equals(prop)
                        )
                    )
                );
            })
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