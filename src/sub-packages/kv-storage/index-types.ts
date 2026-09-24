
import type { IKvStorage, KvRawStorageEventMap } from "./types.ts"

export type {
    IKvStorage,
    /**
     * An alias for IKvStorage. Deprecated.
     */
    IKvStorage as IRawStorage,
    /** The events a store announces, such as a key's value changing. */
    KvRawStorageEventMap
}