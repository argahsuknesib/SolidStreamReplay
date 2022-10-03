import { assert } from "console";
import { getTriples } from "./comunica_utils";
import { anyIsObject, RDFType } from "./prefix_util";
import { DataEntry, RDFObject, TripleEntry } from "./triple";

interface RDFContainer {
    next() : string | undefined;
    prev() : string | undefined;
    contents() : string[];
    // boolean indicating wether the data represents other containers
    // or regular data
    containerOfContainers : boolean;
}

export class TreeContainer implements RDFContainer {

    _pages : string[];
    index : number = 0;
    containerOfContainers : boolean;

    static readonly treeRelationPred = new TripleEntry("relation", "tree:");
    static readonly treeViewPred = new TripleEntry("view", "tree:");
    static readonly treeNodePred = new TripleEntry("node", "tree:");

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

    static fromData(data: RDFObject) : TreeContainer | undefined {
        // the entire processing happens in a try catch block, as
        // there might be issues anywhere within the data that don't
        // properly adhere to the spec
        try {
            // pages are ordered according to their relationships
            const relations = data.get(this.treeRelationPred)! as RDFObject[];
            const pages = new Array<string>(relations.length);
            let containerOfContainers = false;
            for (const [i, relation] of relations.entries()) {
                // TODO: use timestamp (using prefixes lut) to properly sort them
                const node = (relation.get(this.treeNodePred)! as RDFObject);
                assert(node.subj.prefix == "<unknown>", "Subject does not represent a proper URL");
                // TODO: check for trees in tree
                containerOfContainers ||= anyIsObject(
                    node.get(RDFType)! as TripleEntry[],
                    "ldp:",
                    "container"
                );
                pages[i] = node.subj.value;
            }
            return new TreeContainer(pages, containerOfContainers);
        } catch (e) {
            console.log("Incomplete/incorrect TREE-container received. Ignoring...");
            return undefined;
        }
    }    

}

export class LDPContainer implements RDFContainer {

    _pages : string[];
    index : number = 0;

    containerOfContainers;

    static readonly ldpContainsPred = new TripleEntry("contains", "ldp:");

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

    static fromData(data: RDFObject) : LDPContainer | undefined {
        try {
            const pages = data.get(this.ldpContainsPred)! as RDFObject[];
            // TODO: check for tree types as well
            const containerOfContainers = pages.some((value: RDFObject) => anyIsObject(value.get(RDFType)!, "ldp:", "container"));
            return new LDPContainer(pages.map((data: RDFObject) => data.subj.value), containerOfContainers);
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
            // FIXME: proper LDES support instead of falling back to its tree structure
            // and making sure the view represents an RDF object
            console.log("Creating TREE container from LDES data");
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