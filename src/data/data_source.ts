import { TripleEntry, Triple } from "../util/triple";
import { SimpleDataEntry } from "../util/triple";
import { prefixes } from "../prefixes.json";
import { assert } from "console";
import { LDES } from "../util/container_utils";
import { SortedArray } from "../util/sorted_array";

// all imports below are temporary as the data sources are currently read from a data file
const N3 = require('n3');
const fs = require('fs');
const stream = require('stream');
const { once } = require('events');

export class DataSource {

    // general LDES client, shared across the different data sources
    // FIXME
    // private static readonly __ldes_client = newEngine();
    // the URL/location of the container root, which
    // is always polled at the required interval in case of an LDES
    private readonly __container_root_location: string
    // LUT is set using `configureDataLayout` 
    // the keys are the short value for a given predicate,
    // the associated value with these keys is a tuple containing
    // the index/position in the data arrays and wether or not
    // it should be an array or a singular value
    private __predicate_lut : any = {};
    private __predicate_count = 0;
    private __sorting_predicate_index : number | undefined;
    // private __data_buffer : SimpleDataEntry[] = new Array();
    private __data_buffer = new SortedArray<SimpleDataEntry>();
    private __active_data_entry : [TripleEntry, [TripleEntry, TripleEntry | TripleEntry[]][]] | undefined;

    constructor(location: string, type: "remote" | "local") {
        this.__container_root_location = location;
        console.log(`Created a data source with ${type} location ${this.__container_root_location}`);
        if (type == "remote") {
            this.__fetch_remote()
        } else {
            this.__fetch_local();
        }
    }

    private __fetch_remote = async () => {
        LDES.subscribe(this.__container_root_location, (triples) => {
            for (const triple of triples) {
                this.__process_data(triple);
            }
        }).then((clients) => clients[0].start());
    }

    private __fetch_local = async () => {
        // TODO: detect local LDES streams instead of single file data streams (see fetch_remote)
        // create a schedule version for bucket locations (see __fetch_schedule_remote)
        const streamParser = new N3.StreamParser();
        const rdfStream = fs.createReadStream(this.__container_root_location);
        const writer = stream.Writable({ objectMode: true });
        writer._write = (quad: any, encoding: any, done: any) => {
            if (quad) {
                // all entries should be using the long prefixes,
                // so brief is set to false
                this.__process_data(Triple.fromQuad(quad, false));
            }
            done();
        };
        rdfStream.pipe(streamParser);
        const dataStream = streamParser.pipe(writer);
        // waiting for the finish here, so the data is complete once the
        // resulting promise returns (including the dangling one below)
        await once(dataStream, "finish");
        // the last entry is still dangling, but should be complete
        // so adding it to the buffer manually here as well
        this.__insert_current_buffer();
    }

    data() : SimpleDataEntry[] {
        return this.__data_buffer.data();
    }

    // this function `pointer` changes 3 times, so be careful when applying changes
    private __process_data = (data: Triple) => {
        // the initial subject hasn't been set yet
        // so this is the very first time it has been called
        const initialSubject = data.s;
        // once a predicate has been used twice, the boolean (2nd param) gets flipped
        // to true
        const predicates = new Array<[TripleEntry, boolean]>();
        // as the first subjects data can't go to waste, it's being
        // kept here as well
        const firstSampleData = new Array<[TripleEntry, TripleEntry | TripleEntry[]]>();
        // changing the body of this lambda as it has been called once
        this.__process_data = (data: Triple) => {
            if (initialSubject.equals(data.s)) {
                // as long as the same subject is being used,
                // this lambda keeps on being used
                // rather slow approach to do this, but it is
                // executed for the first sample only, and
                // that for ~ 5 entries
                for (const [i, [prop, existingData]] of firstSampleData.entries()) {
                    if (prop.equals(data.p)) {
                        // find and toggle the associated
                        // predicate/obj array boolean if needed
                        for (const tuple of predicates) {
                            if (tuple[0].equals(data.p)) {
                                if (tuple[1]) {
                                    // if the boolean is already set, the element at this
                                    // place is already an array, so simply pushing the
                                    // new object into the array
                                    (existingData as TripleEntry[]).push(data.o);
                                } else {
                                    // otherwise, creating a new array and moving the original
                                    // object as initial value, as well as the new one
                                    tuple[1] = true;
                                    firstSampleData[i][1] = new Array<TripleEntry>(existingData as TripleEntry, data.o);                                    
                                }
                                break;
                            }
                        }
                        return;
                    }
                }
                // predicate did not exist before, creating
                // new entry and adding it to the predicate collection
                // for further processing
                firstSampleData.push([data.p, data.o]);
                // predicate parameters are being stacked up
                ++this.__predicate_count;
                predicates.push([data.p, false]);
                // exiting out of this lambda iteration
                return;
            }
            // subj changed, processing data entry
            // and using the alternative method
            // instead
            this.__configure_data_layout(predicates);
            this.__process_data = this.__append_data_entry;
            // the existing `first sample` in firstSampleData
            // can already be added to the collection as well
            this.__data_buffer.push(new SimpleDataEntry(
                initialSubject,
                firstSampleData,
                this.__sorting_predicate_index
            ));
            // calling the new method with this data point as well,
            // after having set the active entry
            this.__active_data_entry = [data.s, new Array<[TripleEntry, TripleEntry | TripleEntry[]]>(this.__predicate_count)];
            this.__process_data(data);
        }
        // calling it with the first data entry as well
        this.__process_data(data);
    }

    private __append_data_entry(data: Triple) {
        // the base array of elements already exists, as well as
        // the LUT (and count) for predicates
        if (this.__active_data_entry![0].equals(data.s)) {
            // if the active entry matches, its properties can be expanded upon
            // as it has not been completely parsed yet
            const [predicateIndex, isArr] = this.__predicate_lut[data.p.get(true)];
            if (isArr) {
                if (this.__active_data_entry![1][predicateIndex] == undefined) {
                    this.__active_data_entry![1][predicateIndex] = [data.p, new Array<TripleEntry>(data.o)];
                } else {
                    (this.__active_data_entry![1][predicateIndex][1] as TripleEntry[]).push(data.o);
                }
            } else {
                this.__active_data_entry![1][predicateIndex] = [data.p, data.o];
            }
        } else {
            // subject change, creating new SimpleDataEntry from temporary object
            // TODO: use the sorting value (if available) to put this entry at the
            // correct position or sort after the fact
            this.__insert_current_buffer();
            // changing the temporary entry for the new subject
            this.__active_data_entry = [data.s, new Array<[TripleEntry, TripleEntry | TripleEntry[]]>(this.__predicate_count)];
            // calling itself again, now the if branch succeeds and adds the first data point/object to the newly created buffer
            this.__append_data_entry(data);
        }
    }

    private __insert_current_buffer() {
        this.__data_buffer.push(new SimpleDataEntry(
            this.__active_data_entry![0],
            this.__active_data_entry![1],
            this.__sorting_predicate_index
        ));
    }

    private __configure_data_layout(properties: [TripleEntry, boolean][]) {
        // once all properties of a single subject have been read,
        // members are set so all other subjects are configured
        // in the same way (ordering of the predicates)
        // the properties array contains both the type of predicate,
        // as well as a boolean indicating an array (true) or not (false)
        // is required for storing the associated object(s)
        for (const [i, [property, array_required]] of properties.entries()) {
            if (property.prefix !== "<unknown>" && property.value === (prefixes as any)[property.prefix].sorting) {
                // FIXME ignore it instead of asserting, check if another sortable
                // property that is not an array is available, and if so,
                // use that one instead
                assert(!array_required, "Sortable data type is represented using an array (e.g. 2 values present for timestamp property), which is not supported.");
                this.__sorting_predicate_index = i;
                break;
            }
        }
        for (const [i, [property, array_required]] of properties.entries()) {
            // short value representation
            this.__predicate_lut[property.get(true)] = [i, array_required];
        }
    }
}
