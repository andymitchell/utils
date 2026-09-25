import type { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { KvRawStorageEventMap } from "../types.ts";

/** Sends change notices to other contexts, and turns theirs into local `CHANGE` events. */
export type KeyChangeChannel = {
    /** Tells every other context sharing the store that `key` changed. */
    announce(key: string): void;
    /** Stops sending and receiving notices. */
    close(): void;
};

type KeyNotice = { key: string };

/**
 * Keeps stores that share one IndexedDB store, but live in different contexts (tabs, workers,
 * frames), aware of each other's writes.
 *
 * A notice names only the changed key. Each receiver that has `CHANGE` listeners reads the key's
 * current value from the shared database and emits it (`undefined` once removed). The writer
 * never copies the value into the message, however large it is, and receivers nobody is
 * listening to do no work at all.
 *
 * @param options.dbName The IndexedDB database name; with `storeName`, it scopes the channel.
 * @param options.storeName The object store within that database.
 * @param options.events Where received changes are emitted.
 * @param options.read Reads a key's current value from the shared store.
 * @returns A channel to announce local changes on; close it when the store is disposed.
 *
 * @example
 * const notices = openKeyChangeChannel({ dbName, storeName, events: this.events, read: key => this.get(key) });
 * // after a write commits:
 * notices.announce(key);
 *
 * @remarks
 * Because a receiver reads when the notice arrives, it emits the value current at that moment,
 * which may be newer than the write that sent the notice.
 */
export function openKeyChangeChannel<T>(options: {
    dbName: string,
    storeName: string,
    events: TypedCancelableEventEmitter<KvRawStorageEventMap<T>>,
    read: (key: string) => Promise<T | undefined>
}): KeyChangeChannel {
    const { dbName, storeName, events, read } = options;
    const channel = new BroadcastChannel(`kv-storage-keys:${dbName}:${storeName}`);

    channel.onmessage = async (event: MessageEvent<unknown>) => {
        if (!isKeyNotice(event.data) || events.listenerCount('CHANGE') === 0) return;
        const { key } = event.data;
        try {
            events.emit('CHANGE', { key, newValue: await read(key) });
        } catch {
            // The store was disposed or cannot reach its database: there is no current value to report,
            // and the writer has already succeeded, so the notice is dropped.
        }
    };

    return {
        announce: key => channel.postMessage({ key } satisfies KeyNotice),
        close: () => channel.close()
    };
}

function isKeyNotice(data: unknown): data is KeyNotice {
    return typeof data === 'object' && data !== null && typeof (data as Partial<KeyNotice>).key === 'string';
}
