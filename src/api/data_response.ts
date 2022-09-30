// response type obtained when using an location/get[?args...] call
import { DataManager } from '../data/data_manager';
import { DataQueryArguments } from '../util/data_query_arguments';
import { SimpleDataEntry } from '../util/triple';

export class DataResponse {

    data: any;

    constructor(location: string, type: "remote" | "local", args: DataQueryArguments) {
        if (DataManager.hasLocation(location)) {
            this.data = DataManager.
            getExistingData(location)?.
            queryData(args) ?? DataResponse.empty();
        } else {
            DataManager.addLocation(location, type);
            this.data = DataResponse.empty();
        }
    }

    static empty() : any {
        return {
            "@warning": {
                "InvalidLocation": `Given location does not (yet) contain data.`
            }
        };
    };

    static invalid(location: string) : any {
        return {
            "@warning": {
                "InvalidLocation": `Given location "${location}" does not appear to be valid.`
            }
        };
    };

}