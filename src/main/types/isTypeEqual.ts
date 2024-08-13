type EnsureBidirectionalCompatibility<T1, T2> = [T1] extends [T2] ? [T2] extends [T1] ? true : false : false;
export default function isTypeEqual<T1, T2>(value: EnsureBidirectionalCompatibility<Required<T1>, Required<T2>> extends true ? true : never) {}

export function isTypeEqualIgnoringPartials<T1, T2>(value: EnsureBidirectionalCompatibility<T1, T2> extends true ? true : never) {}

// Usage: isTypeEqual<z.infer<typeof ViewSchema>, View>(true); // The true will flag as a type error if the schema or type fall out of alignment 