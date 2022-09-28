import { assert } from "console";

export const transforms = new Map<string, (val: string, format: string) => any>(
    [
        ["timestamp", (val: string, format: string) => {
            assert(format === "ISO8601", "Only ISO8601 is supported currently.");
            return Date.parse(val);
        }],
        ["data", (val: string, format: string) => {
            assert(format === "number", "Only numeric data values are allowed currenlty");
            return parseFloat(val);
        }]
    ]
);
