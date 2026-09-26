import type { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { KvChangeEvent, KvRawStorageEventMap } from "../types.ts";
import { inOrder } from "../inOrder.ts";

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
 * which may be newer than the write that sent the notice. It emits changes in the order their
 * notices arrived, whichever read finishes first, so the last value it emits for a key is never
 * older than the one before. A listener that throws surfaces as an unhandled rejection.
 */
export function openKeyChangeChannel<T>(options: {
    dbName: string,
    storeName: string,
    events: TypedCancelableEventEmitter<KvRawStorageEventMap<T>>,
    read: (key: string) => Promise<T | undefined>
}): KeyChangeChannel {
    const { dbName, storeName, events, read } = options;
    const channel = new BroadcastChannel(`kv-storage-keys:${dbName}:${storeName}`);
    // Reads may finish in any order; emitting in the order notices arrived keeps an older value from landing last.
    const emitInOrder = inOrder<KvChangeEvent<T>>(change => events.emit('CHANGE', change));

    channel.onmessage = (event: MessageEvent<unknown>) => {
        if (!isKeyNotice(event.data) || events.listenerCount('CHANGE') === 0) return;
        const { key } = event.data;
        // A read that fails (the store was disposed or cannot reach its database) is skipped: there is no
        // current value to report, and the writer has already succeeded.
        emitInOrder(read(key).then(newValue => ({ key, newValue })));
    };

    return {
        announce: key => channel.postMessage({ key } satisfies KeyNotice),
        close: () => channel.close()
    };
}

function isKeyNotice(data: unknown): data is KeyNotice {
    return typeof data === 'object' && data !== null && typeof (data as Partial<KeyNotice>).key === 'string';
}
