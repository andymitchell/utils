/** The keys under which one resource's shared history is kept in a key-value store. */
export type StorageKeys = {
    /** The key holding when the shared refusal pause ends. */
    readonly backOffUntil: string;
    /**
     * What every history segment's key starts with. On its own it is also the key of a history
     * kept as one unsegmented log, which a tracker reads as one more segment.
     */
    readonly logPrefix: string;
};

/** What a history segment's key records: who writes to it, and when everything in it has aged out. */
export type SegmentName = {
    /** The tracker instance that writes to the segment; no other writes to it. */
    readonly writerId: string;
    /** When every entry the segment can hold has aged out, in ms since the epoch. */
    readonly expiresTs: number;
};

/**
 * The keys under which the history for `id` is kept.
 *
 * Trackers given the same `id` over the same store read and write these same keys, which is
 * how they share one history.
 *
 * @param id The resource being paced.
 * @returns The refusal-pause key and the prefix of every history segment's key.
 *
 * @example
 * storageKeysFor('gmail-api');
 * // { backOffUntil: 'fetch_pacer_activity_tracker_gmail-api.backoff',
 * //   logPrefix: 'fetch_pacer_activity_tracker_gmail-api.activities' }
 */
export function storageKeysFor(id: string): StorageKeys {
    const base = `fetch_pacer_activity_tracker_${id}`;
    return { backOffUntil: `${base}.backoff`, logPrefix: `${base}.activities` };
}

/**
 * The key of one writer's history segment.
 *
 * @param logPrefix The resource's {@link StorageKeys.logPrefix}.
 * @param segment Who writes to the segment, and when everything in it has aged out.
 * @returns `<logPrefix>.<writerId>.<expiresTs>`, which {@link parseSegmentKey} reads back.
 */
export function segmentKey(logPrefix: string, segment: SegmentName): string {
    return `${logPrefix}.${segment.writerId}.${segment.expiresTs}`;
}

/**
 * Reads who writes to a history segment, and when it expires, from the segment's key.
 *
 * @param logPrefix The resource's {@link StorageKeys.logPrefix}.
 * @param key A key from the store.
 * @returns The segment's writer and expiry; `undefined` for a key that names neither, such as
 * the bare `logPrefix`, or one that does not start with `logPrefix`.
 *
 * @example
 * parseSegmentKey('p.activities', 'p.activities.w1.1700000000000'); // { writerId: 'w1', expiresTs: 1700000000000 }
 * parseSegmentKey('p.activities', 'p.activities');                  // undefined
 *
 * @remarks
 * A writer id cannot contain a dot, so the expiry is everything after the second dot.
 */
export function parseSegmentKey(logPrefix: string, key: string): SegmentName | undefined {
    if( !key.startsWith(logPrefix) ) return undefined;
    const [, writerId, expiry] = /^\.([^.]+)\.(.+)$/.exec(key.slice(logPrefix.length)) ?? [];
    const expiresTs = Number(expiry);
    return writerId!==undefined && Number.isFinite(expiresTs)? { writerId, expiresTs } : undefined;
}
