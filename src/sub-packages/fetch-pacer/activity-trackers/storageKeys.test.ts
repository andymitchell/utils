import { describe, expect, it } from 'vitest';

import { parseSegmentKey, segmentKey, storageKeysFor } from './storageKeys.ts';
import { mulberry32 } from '../testing-utils/mulberry32.ts';
import { uuidV4 } from '../../uid/index.ts';

const { logPrefix } = storageKeysFor('mail-api');

describe('the keys a resource\'s history is kept under', () => {

    it('keeps the key names that histories already in stores were written under', () => {
        // Stores outlive the code that wrote them: a renamed key would lose every pause and charge already recorded.
        expect(storageKeysFor('mail-api')).toEqual({
            backOffUntil: 'fetch_pacer_activity_tracker_mail-api.backoff',
            logPrefix: 'fetch_pacer_activity_tracker_mail-api.activities'
        });
        expect(segmentKey(logPrefix, { writerId: 'writer-1', expiresTs: 5000 })).toBe('fetch_pacer_activity_tracker_mail-api.activities.writer-1.5000');
    });

    it('gives every tracker of the same resource the same keys, so they share one history', () => {
        expect(storageKeysFor('mail-api')).toEqual(storageKeysFor('mail-api'));
    });

    it('keeps the refusal pause out of the keys listed when reading the history', () => {
        // Reading lists every key under the log prefix and treats each as history.
        const keys = storageKeysFor('mail-api');
        expect(keys.backOffUntil.startsWith(keys.logPrefix)).toBe(false);
    });

});

describe('naming a history segment', () => {

    it('reads back the writer and expiry the segment was named with', () => {
        const random = mulberry32(1);
        for (let i = 0; i < 200; i++) {
            const segment = { writerId: uuidV4(), expiresTs: Math.floor(random() * 4_000_000_000_000) };

            const key = segmentKey(logPrefix, segment);

            expect(key.startsWith(logPrefix), key).toBe(true);
            expect(parseSegmentKey(logPrefix, key), key).toEqual(segment);
        }
    });

    it('reads the bare log prefix, where an unsegmented history is kept, as naming no segment', () => {
        expect(parseSegmentKey(logPrefix, logPrefix)).toBeUndefined();
    });

    it('reads a key whose expiry is not a number as naming no segment', () => {
        expect(parseSegmentKey(logPrefix, `${logPrefix}.writer-1.soon`)).toBeUndefined();
        expect(parseSegmentKey(logPrefix, `${logPrefix}.writer-1`)).toBeUndefined();
    });

    it('does not read another resource\'s segment as one of its own', () => {
        // One id starts the same way; the other is the same length, so only the prefix tells them apart.
        for (const otherId of ['mail-api-2', 'mail-apx']) {
            const otherKey = segmentKey(storageKeysFor(otherId).logPrefix, { writerId: 'writer-1', expiresTs: 5000 });

            expect(parseSegmentKey(logPrefix, otherKey), otherKey).toBeUndefined();
        }
    });

});
