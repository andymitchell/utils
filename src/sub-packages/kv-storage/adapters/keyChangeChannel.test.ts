import { onTestFinished } from "vitest";
import { TypedCancelableEventEmitter } from "../../typed-cancelable-event-emitter/index.ts";
import type { KvChangeEvent, KvRawStorageEventMap } from "../types.ts";
import { openKeyChangeChannel } from "./keyChangeChannel.ts";

describe('change notices from another context', () => {

    // IndexedDB may finish two reads in either order; the fake one used elsewhere never reorders them, so reads are held here.
    test('are emitted in the order they arrived, even when a later one is read back first', async () => {
        const scope = { dbName: 'kv-storage-in-order', storeName: 'kv_store' };
        const pendingReads: Array<(value: string) => void> = [];
        let bothReadsStarted!: () => void;
        const readsStarted = new Promise<void>(resolve => bothReadsStarted = resolve);

        const events = new TypedCancelableEventEmitter<KvRawStorageEventMap<string>>();
        const heard: KvChangeEvent<string>[] = [];
        const heardBoth = new Promise<void>(resolve => events.on('CHANGE', event => {
            heard.push(event);
            if (heard.length === 2) resolve();
        }));
        const receiver = openKeyChangeChannel({ ...scope, events, read: () => new Promise<string>(finish => {
            pendingReads.push(finish);
            if (pendingReads.length === 2) bothReadsStarted();
        }) });
        const sender = openKeyChangeChannel({ ...scope, events: new TypedCancelableEventEmitter<KvRawStorageEventMap<string>>(), read: async () => undefined });
        onTestFinished(() => {
            receiver.close();
            sender.close();
        });

        sender.announce('first');
        sender.announce('second');
        await readsStarted;
        const [finishFirst, finishSecond] = pendingReads;
        finishSecond!('value of second');
        finishFirst!('value of first');
        await heardBoth;

        expect(heard).toEqual([
            { key: 'first', newValue: 'value of first' },
            { key: 'second', newValue: 'value of second' }
        ]);
    }, 1000);
});
