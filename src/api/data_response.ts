// response type obtained when using an location/get[?args...] call
import { DataManager } from '../data/data_manager';
import { DataQueryArguments } from '../util/data_query_arguments';
import { DataEntry } from '../util/triple';

export class DataResponse {

    data: any;

    constructor(location: string, args: DataQueryArguments) {
        if (DataManager.hasLocation(location)) {
            this.data = DataManager.
            getExistingData(location)?.
            queryData(args) ?? DataResponse.empty();
        } else {
            DataManager.addLocation(location);
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

}