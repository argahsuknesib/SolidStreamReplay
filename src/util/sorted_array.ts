export interface Comparable {
    // compares two of the same type,
    // returning an integer being either
    // - negative (A < B)
    // - positive (B < A)
    // - zero (A == B sorting wise)
    cmp(other: Comparable) : number;
    // can(!) be true when cmp(other) == 0
    equals(other: Comparable) : boolean;
}

export class SortedArray<Type extends Comparable> {

    private _data : Type[] = [];

    constructor(data: Type[] | undefined = undefined) {
        // cannot assume source is sorted, so inserting
        // in _data using the __insert method
        if (data) {
            for (const value of data) {
                this.push(value);
            }
        }
    }

    static fromSorted<Type extends Comparable>(data: Type[]) : SortedArray<Type> {
        const result = new SortedArray<Type>([]);
        result._data = data;
        return result;
    }

    push(value: Type) {
        this._data.splice(this.__get_index(value), 0, value);
    }

    has(value: Type) : boolean {
        return this._data[this.__get_index(value)].equals(value);
    }

    data() : Type[] {
        return this._data;
    }

    // src: https://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
    private __get_index(value: Type) : number {
        let low = 0;
        let high = this._data.length;    
        while (low < high) {
            let mid = (low + high) >>> 1;
            if (this._data[mid].cmp(value) < 0) {
                low = mid + 1;
            } else {
                high = mid;
            };
        }
        return low;
    }

    // TODO: maybe add custom filter methods, so sub arrays through sorting ranges are easily
    // obtained

}
