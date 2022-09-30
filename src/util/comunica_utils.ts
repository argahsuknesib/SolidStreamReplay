import { Triple } from "./triple";
import { QueryEngine } from "@comunica/query-sparql";

const __comunica_engine = new QueryEngine()

export async function getTriples(
    location: string,
    limit: number | undefined = undefined
) : Promise<Triple[]> {
    const stream = await __comunica_engine.queryBindings(
        `SELECT * WHERE { ?s ?p ?o . }` + (limit? ` LIMIT ${limit}` : ""),
        {
            "sources": [location]
        }
    );
    return (await stream.toArray()).map((binding) => Triple.fromBinding(binding));
}