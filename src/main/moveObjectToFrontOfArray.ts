/**
 * Returns a new array with all objects that match a specific key-value pair moved to the front.
 *
 * @template T - The object type in the array.
 * @template K - The key of the object to match.
 * @param {T[]} arr - The original array to process.
 * @param {K} key - The key to match in the object.
 * @param {T[K]} value - The value to match for the given key.
 * @returns {T[]} A new array with matching objects first, followed by the rest.
 */
export function moveObjectToFront<T, K extends keyof T>(
    arr: T[],
    key: K,
    value: T[K]
  ): T[] {
    return [
      ...arr.filter(item => item[key] === value),
      ...arr.filter(item => item[key] !== value),
    ];
  }
  

  /**
 * Moves all objects with a specific key-value pair to the front of the array (in-place).
 *
 * @template T - The object type in the array.
 * @template K - The key of the object to match.
 * @param {T[]} arr - The array to mutate and sort.
 * @param {K} key - The key to match in the object.
 * @param {T[K]} value - The value to match for the given key.
 * @returns {T[]} The same array with matching objects moved to the front.
 */
export function moveObjectToFrontMutate<T, K extends keyof T>(
    arr: T[],
    key: K,
    value: T[K]
  ): T[] {
    return arr.sort((a, b) =>
      a[key] === value ? -1 : b[key] === value ? 1 : 0
    );
  }
  