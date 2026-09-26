import { describe, expect, test } from "vitest";
import { inOrder } from "./inOrder.ts";
import { nextMacrotask, recordUnhandledRejections } from "./testing-helpers/unhandledRejections.ts";

describe('inOrder', () => {

    test('delivers results in the order they were queued, whatever order they settle in', async () => {
        const delivered: string[] = [];
        const announce = inOrder<string>(value => delivered.push(value));
        const first = Promise.withResolvers<string>();
        const second = Promise.withResolvers<string>();
        const third = Promise.withResolvers<string>();

        announce(first.promise);
        announce(second.promise);
        announce(third.promise);
        third.resolve('third');
        second.resolve('second');
        await nextMacrotask();
        expect(delivered).toEqual([]);

        first.resolve('first');
        await nextMacrotask();
        expect(delivered).toEqual(['first', 'second', 'third']);
    });

    test('a result that rejects is skipped, and those after it are still delivered', async () => {
        const delivered: string[] = [];
        const announce = inOrder<string>(value => delivered.push(value));

        announce(Promise.resolve('before'));
        announce(Promise.reject(new Error('unreadable')));
        announce(Promise.resolve('after'));
        await nextMacrotask();

        expect(delivered).toEqual(['before', 'after']);
    });

    test('a result that rejects while an earlier one is still pending raises no unhandled rejection', async () => {
        const unhandled = recordUnhandledRejections();
        const delivered: string[] = [];
        const announce = inOrder<string>(value => delivered.push(value));
        const slow = Promise.withResolvers<string>();

        announce(slow.promise);
        announce(Promise.reject(new Error('unreadable')));
        await nextMacrotask();
        slow.resolve('slow');
        await nextMacrotask();

        expect(unhandled).toEqual([]);
        expect(delivered).toEqual(['slow']);
    });
});
