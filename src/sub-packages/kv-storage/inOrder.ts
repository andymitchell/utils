/**
 * Delivers results in the order they were queued, however soon each one settles.
 *
 * A change announced after asynchronous work (decrypting its value, reading it back) would
 * otherwise be announced whenever that work finishes: a quick change, such as a removal, could
 * overtake a slower one made before it and leave listeners holding the older state. The work
 * itself still runs at once; only the delivery waits its turn.
 *
 * @param deliver Called with each result once it, and every result queued before it, have settled.
 * @returns Queues a result for delivery. A result that rejects is skipped, and those after it are
 * still delivered.
 *
 * @example
 * const announce = inOrder<string>(value => console.log(value));
 * announce(slowly('first'));
 * announce(Promise.resolve('second')); // logs 'first', then 'second'
 *
 * @remarks
 * A `deliver` that throws does not hold up later deliveries; its error surfaces as an unhandled
 * rejection, as from any asynchronous callback.
 */
export function inOrder<T>(deliver: (value: T) => void): (result: Promise<T>) => void {
    let previous: Promise<unknown> = Promise.resolve();
    return result => {
        const turn = previous.then(() => result);
        previous = turn.catch(() => {});
        void turn.then(deliver, () => {});
    };
}
