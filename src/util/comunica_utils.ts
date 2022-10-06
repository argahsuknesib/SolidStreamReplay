import { Triple } from "./triple";
import { QueryEngine } from "@comunica/query-sparql";

const __comunica_engine = new QueryEngine()

export async function getTriples(
    location: string,
    limit: number | undefined = undefined
) : Promise<Triple[]> {
    try {
        // Invalidate the full cache
        // src: https://comunica.dev/docs/query/advanced/caching/
        __comunica_engine.invalidateHttpCache();
        const stream = await __comunica_engine.queryBindings(
            `SELECT * WHERE { ?s ?p ?o . }` + (limit? ` LIMIT ${limit}` : ""),
            {
                "sources": [location]
            }
        );
        return (await stream.toArray()).map((binding) => Triple.fromBinding(binding));
    } catch (e) {
        console.log(`Something went wrong while fetching triples from \`${location}\`:`)
        console.log(e);
        return [];
    }
}