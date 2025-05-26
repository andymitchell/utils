
import { vi } from 'vitest';
import type { IPaceTracker, PaceTrackerOptions } from '../types.ts';
import { convertTimestampToMillisecondsFromNow } from '../utils/convertTimestampToMillisecondsFromNow.ts';


export class MockPaceTracker implements IPaceTracker {
    // spyable methods
    public logSuccess = vi.fn(async (points: number) => {
        /* no-op */
    });

    public logBackOff = vi.fn<() => Promise<void>>(async (minimumBackOffMs?: number) => {
        /* no-op */
    });

    public getActiveBackOffForMs = vi.fn(async () => {
        return convertTimestampToMillisecondsFromNow(await this.getActiveBackOffUntilTs());
    });

    getActiveBackOffUntilTs = vi.fn<() => Promise<number | undefined>>(async () => undefined);


    public setActive = vi.fn(async (active: boolean) => {
        /* no-op */
        this.active = active;
    });

    public isActive = vi.fn<() => Promise<boolean>>(async () => {
        /* no-op */
        return this.active;
    });

    public dispose = vi.fn(async () => {
        /* no-op */
    });

    // mimic the real constructor signature so you can `vi.mock()` it if desired
    constructor(id: string, options?: PaceTrackerOptions) {
        // you could capture these if you want:
        this.id = id;
        this.options = options;
    }

    

    // for introspection in tests
    public readonly id!: string;
    public readonly options?: PaceTrackerOptions;
    public active = false;
}
