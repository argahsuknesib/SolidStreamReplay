import { assert } from "console";
import { getTriples } from "./comunica_utils";
import { RDFType } from "./prefix_types";
import { anyIsObject, reasonOnPredicate } from "./prefix_util";
import { Comparable, SortedArray } from "./sorted_array";
import { DataEntry, isRDFObject, RDFObject, Triple, TripleEntry, UnnamedObj } from "./triple";

interface RDFContainer {
    next() : string | undefined;
    prev() : string | undefined;
    contents() : string[];
    inbox() : string | undefined;
    // boolean indicating wether the data represents other containers
    // or regular data
    containerOfContainers : boolean;
}

export class TreeContainer implements RDFContainer {

    _pages : string[];
    _inbox : string | undefined
    index : number = 0;
    containerOfContainers : boolean;

    static readonly treeRelationPred = new TripleEntry("relation", "tree:");
    static readonly treeViewPred = new TripleEntry("view", "tree:");

    constructor(_pages : string[], containerOfContainers : boolean) {
        this._pages = _pages;
        this.containerOfContainers = containerOfContainers;
    }

    next() : string | undefined {
        if (this.index < this._pages.length) {
            this.index++;
            return this._pages[this.index - 1];
        }
        return undefined;
    }

    prev() : string | undefined {
        if (this.index > 0) {
            this.index--;
            return this._pages[this.index - 1];
        }
        return undefined;
    }

    contents() : string[] {
        return this._pages;
    }

    inbox() : string | undefined {
        return this._inbox;
    }

    static fromData(data: RDFObject) : TreeContainer | undefined {
        // the entire processing happens in a try catch block, as
        // there might be issues anywhere within the data that don't
        // properly adhere to the spec
        try {
            // pages are ordered according to their relationships
            const relations = new SortedArray<TreeRelation>(
                (data.get(this.treeRelationPred)! as RDFObject[]).map((obj) => TreeRelation.from(obj))
            );
            const pages = relations.data().map((relation) => relation._page);
            // TODO: it might be better to handle this container type detection on a page per page
            // basis instead although LDES-in-LDP does not require this (fixed layout)
            const containerOfContainers = relations.data().some((relation) => relation.containerOfContainers);
            const container = new TreeContainer(pages, containerOfContainers);
            container._inbox = (data.get(LDPContainer.ldpInboxPred) as RDFObject | undefined)?.subj.value;
            return container;
        } catch (e) {
            console.log("Incomplete/incorrect TREE-container received. Ignoring...");
            return undefined;
        }
    }

}

class TreeRelation implements Comparable {

    static readonly treePathPred = new TripleEntry("path", "tree:");
    static readonly treeNodePred = new TripleEntry("node", "tree:");
    static readonly treeValuePred = new TripleEntry("value", "tree:");

    constructor(
        readonly _page: string,
        readonly _sort_value: number,
        readonly containerOfContainers: boolean
    ) {

    }

    static from(obj: RDFObject) : TreeRelation {
        const node = obj.get(this.treeNodePred) as RDFObject;
        const [transform, _, format] = reasonOnPredicate(obj.get(this.treePathPred) as TripleEntry);
        assert(node.subj.prefix == "<unknown>", "Subject does not represent a proper URL");
        assert(transform && format, "Invalid tree:path parameter in tree:relation");
        const sortedValue = transform!((obj.get(this.treeValuePred) as TripleEntry).value, format!);
        return new TreeRelation(
            node.subj.value,
            sortedValue,
            anyIsObject(
                node.get(RDFType)! as TripleEntry[],
                "ldp:",
                "container"
            )
        )
    }

    cmp(other: TreeRelation): number {
        return this._sort_value - other._sort_value;
    }

    equals(other: TreeRelation): boolean {
        return this._sort_value == other._sort_value
            && this._page === other._page;
    }

}

export class LDPContainer implements RDFContainer {

    _pages : string[];
    _inbox : string | undefined;
    index : number = 0;

    containerOfContainers;

    static readonly ldpContainsPred = new TripleEntry("contains", "ldp:");
    static readonly ldpInboxPred = new TripleEntry("inbox", "ldp:");

    constructor(_pages: string[], containerOfContainers: boolean) {
        this._pages = _pages;
        this.containerOfContainers = containerOfContainers;
    }

    next() : string | undefined {
        if (this._pages.length < this.index) {
            this.index++;
            return this._pages[this.index - 1];
        }
        return undefined;
    }

    prev() : string | undefined {
        if (this.index > 0) {
            this.index--;
            return this._pages[this.index - 1];
        }
        return undefined;
    }

    contents() : string[] {
        return this._pages;
    }

    inbox() : string | undefined {
        return this._inbox;
    }

    static fromData(data: RDFObject) : LDPContainer | undefined {
        try {
            const pages = data.get(this.ldpContainsPred)! as RDFObject | RDFObject[];
            if (isRDFObject(pages)) {
                // TODO: check for tree types as well
                const containerOfContainers = anyIsObject(pages.get(RDFType)!, "ldp:", "container");
                const container = new LDPContainer([pages.subj.value], containerOfContainers);
                container._inbox = (data.get(LDPContainer.ldpInboxPred) as RDFObject | undefined)?.subj.value;
                return container;
            } else {
                // TODO: check for tree types as well
                const containerOfContainers = pages.some((value: RDFObject) => anyIsObject(value.get(RDFType)!, "ldp:", "container"));
                const container = new LDPContainer(pages.map((data: RDFObject) => data.subj.value), containerOfContainers);
                container._inbox = (data.get(LDPContainer.ldpInboxPred) as RDFObject | undefined)?.subj.value;
                return container;    
            }
        } catch (e) {
            console.log("Incomplete/incorrect LDP-container received. Ignoring...");
            return undefined;
        }
    }    

}

export function parseContainer(data: RDFObject) : RDFContainer | undefined {
    // see if the type matches either LDES, TREE and/or LDP
    const types = data.get(RDFType);
    if (types != undefined) {
        if (anyIsObject(types, "tree:", "node")) {
            return TreeContainer.fromData(data);
        } else if (anyIsObject(types, "ldp:", "container")) {
            return LDPContainer.fromData(data);
        } else if (anyIsObject(types, "ldes:", "stream")) {
            return TreeContainer.fromData(data.get(TreeContainer.treeViewPred)! as RDFObject);
        }
    }
    // no supporter container type detected, so none can be returned
    return undefined;
}

// the same method as the one above, except this now also obtains the data from the
// location, as well as traverse the various data entries found in the
// container(s) representing other containers until only the data itself is left
// the locations of these different data entries are sorted by how they are
// defined in the container structures, and only their remote locations are
// returned
// TODO sorting
// TODO support both remote and local data
export async function parseContainerRecursive(location: string) : Promise<string[] | undefined> {
    try {
        const dataEntries = DataEntry.fromTriples(await getTriples(location));
        const dataLocations = new Array<string>();
        // typically only one container entry exists, but it is possible for multiple
        // containers to be defined in the remote location
        for (const data of dataEntries) {
            // parse normally
            const container = parseContainer(data);
            if (container) {
                if (container.containerOfContainers) {
                    let loc;
                    while (loc = container.next()) {
                        const data = await parseContainerRecursive(loc);
                        if (data) {
                            // TODO: instead of just pushing, sort where possible
                            dataLocations.push(...data);
                        }
                    }
                } else {
                    dataLocations.push(...container.contents());
                }
            } else {
                console.log(`Container at \`${location}\` is either empty or invalid.`)
            }
        }
        return dataLocations;
    } catch (e) {
        console.log(`Something went wrong when trying to parse the container at \`${location}\`:`);
        console.log(e);
    }
    // no supporter container type detected, or something went wrong, so nothing can be returned
    return undefined;
}

type DataCallback = (data: Triple[]) => void;

export class LDES {
    // the root path of the LDES
    _loc : string
    // LDES consists of a single TREE-view, which is the root
    // container, represented using a single LDES page
    _root_container : LDES_Page;
    // from the pages above, their individual data entries are
    // collected here
    // TODO: sort this buffer so the top index is the oldest data sample,
    // and the last index the newest data sample
    _data_buffer : string[] = [];
    // the inbox location; this location gets polled first, and new ones get added to
    // the data buffer
    _inbox : string | undefined;
    // callback used when data is received from the stream
    _callback : DataCallback;

    constructor(loc: string, root: RDFContainer, callback: DataCallback) {
        this._loc = loc;
        this._callback = callback;
        this._root_container = new LDES_Page(this, loc, root);
    }

    static async subscribe(url: string, callback: DataCallback) : Promise<LDES[]> {
        const result : LDES[] = [];
        for (const data of DataEntry.fromTriples(await getTriples(url))) {
            try {
                if (anyIsObject(data.get(RDFType)!, "ldes:", "stream")) {
                    // parse the pages using its tree structure
                    const treeSubdata = data.get(TreeContainer.treeViewPred)! as RDFObject;
                    const treeContainer = parseContainer(treeSubdata);
                    if (treeContainer) {
                        // LDES found
                        result.push(new LDES(url, treeContainer, callback));
                    }
                }
            } catch(e) {
                console.log(`Something went wrong when parsing the stream data at location \`${url}\` for subject \`${data.subj.get()}\`:`);
                console.log(e);
            }
        }
        return result;
    }

    // starts scheduled polling and parsing of incoming data using the provided callback
    start(intervalMs: number = 60000, initialDelayMs: number = 1000) {
        // poll near instantly first, then schedule
        // further polling
        setTimeout(() => {
            let loc;
            while (loc = this._data_buffer.shift()) {
                getTriples(loc).then(this._callback);
            }
            setInterval(() => this.__poll(), intervalMs);
        }, initialDelayMs);
    }

    // checks the stream for any update
    private async __poll() {
        // at least two containers have to update: the root (tree) container
        // and the not yet filled up container
        this._root_container.update();
        // TODO: not yet filled up container update too
        // DataEntry.fromTriples(await getTriples(this._root)).forEach((data) => this.__parseStreamData(data));

        // when new data is added to the buffer, calling this method
        // consumes this data using the set callback
        let loc;
        while (loc = this._data_buffer.shift()) {
            getTriples(loc).then(this._callback);
        }
    }

}

export class LDES_Page {

    // the parent stream, used to add its data entries when obtained
    readonly _parent: LDES;
    // the root location
    readonly _path: string;
    // the container representation found at this path
    _container: RDFContainer;
    // child pages (if any), for pages that are made up of containers
    // containing data instead of actual data directly
    _children : LDES_Page[] = [];
    // the contents of the container from the previous fetch
    // (= all the URLs contained in the page's container)
    _data = new Set<string>();
    // method used to parse the data of the container, depending on
    // wether or not this is a regular container or a container of containers
    interpretContainerData : () => void

    constructor(readonly parent: LDES, readonly root: string, container: RDFContainer) {
        this._parent = parent;
        this._path = root;
        this._container = container;
    
        // depending on the flag found in the container,
        // either its contents or data obtained from its contents
        // are used
        if (this._container.containerOfContainers) {
            this.interpretContainerData = this.interpretContainerOfContainer;
        } else {
            this.interpretContainerData = this.interpretRegularContainer;
        }
        // fill in the members using the values from the container
        this.interpretContainerData();
    }

    interpretContainerOfContainer() {
        // if the container has an inbox, set is as the current inbox
        // for the parent
        const inbox = this._container.inbox();
        if (inbox != undefined) {
            this._parent._inbox = inbox;
        }
        // update all the children pages
        for (const _page of this._children) {
            _page.update();
        }
        iterate_new_paths:
        // TODO: make sure contents() have been sorted first
        // and maybe use 2D arrays and stream indexing so the
        //  various promises don't interfere with each others
        // ordering (data races)
        for (const path of this._container.contents()) {
            // check if the path is used as inbox, in which
            // case it gets ignored
            if (path === this._parent._inbox) {
                continue iterate_new_paths;
            }
            // check if path already exists in _children (_data)
            // if it does, it already got updated above
            if (this._data.has(path)) {
                continue iterate_new_paths;
            }    
            // if not, get its data and add it as a child
            console.log(`Fetching data for \`${path}\`.`);
            getTriples(path).then((triples) => {
                DataEntry.fromTriples(triples).forEach((entry) => {
                    const container = parseContainer(entry);
                    if (container) {
                        this._children.push(new LDES_Page(this.parent, path, container));
                    } else {
                        console.log(`Data at location \`${path}\` did not contain a valid container structure. Found:`);
                        entry.print();
                    }
                });
            });
            this._data.add(path);
        }
    }

    interpretRegularContainer() {
        // add all the container contents that are not yet im the _data set
        for (const url of this._container.contents()) {
            if (!this._data.has(url)) {
                this._parent._data_buffer.push(url);
                // mark it as already checked
                this._data.add(url);
            }
        } 
    }

    async update() {
        // fetches the root location again, and updates
        // its children (or parent data) accordingly
        for (const data of DataEntry.fromTriples(await getTriples(this._path))) {
            const container = parseContainer(data);
            if (container) {
                // container at path found, can be used
                this._container = container;
                // the new container data can now be processed
                this.interpretContainerData();
                // no other containers are expected to be present at this
                // location
                return;
            }
        };
        console.log(`No valid container structure was found at \`${this._path}\`.`);
    }

}