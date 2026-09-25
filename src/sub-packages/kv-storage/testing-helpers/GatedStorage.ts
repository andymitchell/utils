import { MemoryStorage } from "../adapters/MemoryStorage.ts";
import type { IKvStorage } from "../types.ts";

/**
 * An in-memory store whose reads wait until the test releases them, so a test can see how many
 * reads a caller has started at once. Writes, removals and key listing go straight through.
 *
 * @example
 * const adapter = new GatedStorage();
 * const reading = store.getAll();
 * await new Promise(resolve => setTimeout(resolve, 0)); // let the caller start its reads
 * adapter.pendingReads(); // reads started and not yet answered
 * adapter.release();
 * await reading;
 */
export class GatedStorage implements IKvStorage<string> {
    #inner = new MemoryStorage();
    #waiting: (() => void)[] = [];
    #released = false;
    events = this.#inner.events;

    async get(key: string): Promise<string | undefined> {
        if (!this.#released) await new Promise<void>(resolve => this.#waiting.push(resolve));
        return await this.#inner.get(key);
    }

    /** @returns How many reads are waiting to be released. */
    pendingReads(): number {
        return this.#waiting.length;
    }

    /** Answers every waiting read, and every read from now on at once. */
    release(): void {
        this.#released = true;
        this.#waiting.splice(0).forEach(resolve => resolve());
    }

    set = (key: string, value: string) => this.#inner.set(key, value);
    remove = (key: string) => this.#inner.remove(key);
    getAllKeys = (keyNamespace?: string) => this.#inner.getAllKeys(keyNamespace);
    dispose = () => this.#inner.dispose();
}
