/**
 * A small seeded random number generator, so a failing generated scenario can be replayed from
 * its seed.
 *
 * @param seed Any integer; the same seed always gives the same sequence.
 * @returns A function giving the next number in `[0, 1)` each time it is called.
 *
 * @example
 * const random = mulberry32(42);
 * const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
 */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
