import express from "express";

import { DataResponse } from "./data_response";
import { getRemotePath } from "./converters";
import { DataQueryArguments } from "../util/data_query_arguments";

export class APIServer {

    constructor(port: number) {
        const app = express();
        // simple root request, sending debug response
        app.get("/", (req, res) => {
            // TODO
            res.json({"empty": "Nothing implemented here yet"});
        });

        app.get("/:loc_base64/info", (req, res) => {
            // TODO show stats, such as available number of datapoints,
            // predicates, sortable or not, if constant timestep - its frequency/dt,
            // outer timestamps available, ...
            // TODO this query should also add it as a source, just like DataResponse
            // does internally
            const location = getRemotePath(req.params.loc_base64);
            res.json(location);
        });
        
        app.get("/:loc_base64/get", async (req, res, next) => {
            const location = getRemotePath(req.params.loc_base64);
            if (location) {
                res.json(
                    new DataResponse(location, DataQueryArguments.from(req.query)).data
                );
                next();
            } else {
                res.json(DataResponse.empty);
            }
        });
        
        app.listen(port);
    }

}
