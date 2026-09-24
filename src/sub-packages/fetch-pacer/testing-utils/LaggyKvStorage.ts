import type { IKvStorage, KvRawStorageEventMap } from '../../kv-storage/types.ts';
import { MemoryStorage } from '../../kv-storage/index-node.ts';
import { TypedCancelableEventEmitter } from '../../typed-cancelable-event-emitter/index.ts';

/** An operation a key-value store performs. */
export type KvOp = 'get' | 'set' | 'remove' | 'getAllKeys';

/**
 * How long each operation takes, in ms: one fixed lag for everything, or a lag chosen per call.
 * `nth` counts the earlier calls of that same operation, so `nth === 0` is its first call.
 */
export type LagSchedule = number | ((op: KvOp, nth: number) => number);

/**
 * A key-value store whose operations take time, so a test can make work from several
 * instances overlap.
 *
 * An in-memory store answers within the same turn of the event loop, so two writers sharing it
 * never interleave and races between them cannot be reproduced. This wraps a store and makes
 * every operation wait on a timer first, which under fake timers lets a test decide exactly
 * which operations are still in flight when another one starts.
 *
 * @example
 * vi.useFakeTimers();
 * // The first write takes 1100 ms; everything else answers on the next timer tick.
 * const store = new LaggyKvStorage((op, nth) => op === 'set' && nth === 0 ? 1100 : 0);
 * await settle(store.set('k', 1));
 * expect(store.calls.set).toBe(1);
 *
 * @remarks
 * Even a lag of 0 goes through a timer, so under fake timers every operation needs the clock
 * moved (at least `advanceTimersByTimeAsync(1)`) before it answers.
 */
export class LaggyKvStorage implements IKvStorage {
    #calls: Readonly<Record<KvOp, number>> = { get: 0, set: 0, remove: 0, getAllKeys: 0 };

    /**
     * The wrapped store's change announcements, or an emitter that never fires when the store
     * was built with `emit_changes: false`.
     */
    readonly events: IKvStorage['events'];

    readonly #inner: IKvStorage;
    readonly #lag: LagSchedule;

    /**
     * @param lag How long operations take (see {@link LagSchedule}).
     * @param options `emit_changes: false` stops change announcements, modelling stores that do
     * not relay other writers' changes. Announcements pass through by default.
     * @param inner The store that actually holds the data. Defaults to a fresh in-memory store.
     */
    constructor(lag: LagSchedule, options?: { emit_changes?: boolean }, inner: IKvStorage = new MemoryStorage()) {
        this.#lag = lag;
        this.#inner = inner;
        this.events = options?.emit_changes === false ? new TypedCancelableEventEmitter<KvRawStorageEventMap>() : inner.events;
    }

    /** How many times each operation has been asked for; lets a test check that nothing was read. */
    get calls(): Readonly<Record<KvOp, number>> {
        return { ...this.#calls };
    }

    async get(key: string): Promise<unknown> {
        await this.#wait('get');
        return this.#inner.get(key);
    }

    async set(key: string, value: unknown): Promise<void> {
        await this.#wait('set');
        return this.#inner.set(key, value);
    }

    async remove(key: string): Promise<void> {
        await this.#wait('remove');
        return this.#inner.remove(key);
    }

    async getAllKeys(keyNamespace?: string): Promise<string[]> {
        await this.#wait('getAllKeys');
        return this.#inner.getAllKeys(keyNamespace);
    }

    async dispose(): Promise<void> {
        return this.#inner.dispose();
    }

    async #wait(op: KvOp): Promise<void> {
        const nth = this.#calls[op];
        this.#calls = { ...this.#calls, [op]: nth + 1 };
        const lagMs = typeof this.#lag === 'number' ? this.#lag : this.#lag(op, nth);
        await new Promise<void>(resolve => setTimeout(resolve, lagMs));
    }
}
