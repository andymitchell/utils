
export type FakeIdb = {
    indexedDB: IDBFactory,
    IDBKeyRange: {
		bound: Function;
		lowerBound: Function;
		upperBound: Function;
	}
}