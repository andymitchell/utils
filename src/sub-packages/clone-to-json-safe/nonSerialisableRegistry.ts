import type { NonSerialisableHandling } from "./types.ts";

/**
 * What `JSON.stringify` emits for a non-serialisable value — the `normalise`-mode (oracle) output.
 *
 * `'json'` carries a SAFE builtin extractor used when the oracle keeps a real value (Date→ISO, URL→href);
 * the other variants are the oracle's lossy collapses.
 */
export type NormaliseDisposition =
    | { to: 'json'; value: (v: unknown) => unknown }
    | { to: 'empty-object' }
    | { to: 'null' }
    | { to: 'drop' };

/**
 * One non-serialisable type's outcome. The two axes are independent: `normalise` is the JSON oracle output,
 * while `redactDetail` is the optional `redact:<tag>:<detail>` suffix — a type can have a redact string yet
 * still collapse to `{}` under the oracle (e.g. RegExp), which a single denylist could not express.
 */
export type NonSerialisableRule = {
    /** Marker name (`redact:<tag>`) and fidelity-bucket label. */
    tag: string;
    /** What `normalise` produces (the `JSON.stringify` oracle). */
    normalise: NormaliseDisposition;
    /** SAFE builtin string appended as `redact:<tag>:<detail>`; absent ⇒ a bare `redact:<tag>` marker. */
    redactDetail?: (value: unknown) => string;
};

/** An object-type rule, paired with the brand-check that recognises a genuine instance. */
type ObjectRule = NonSerialisableRule & { match: (value: object) => boolean };

/** The verdict for one leaf: assign a value, or drop it (omit the key / leave an array hole). */
export type LeafResolution = { kind: 'drop' } | { kind: 'value'; value: unknown };

/**
 * The built-in accessor for `proto[key]`, captured from the prototype so a value is always inspected
 * through the language's own accessor and never through a property the value itself could define — reading
 * the slot therefore cannot run user code.
 */
function slotGetter(proto: object, key: string): (this: unknown) => unknown {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (!desc?.get) throw new Error(`clone-to-json-safe: expected an accessor for "${key}"`);
    return desc.get;
}

// Internal-slot accessors/methods of the built-ins. Each touches a slot reserved for genuine instances, so
// it answers for a real instance and throws for any object that merely inherits the prototype or brands
// itself — and it never reads a value-supplied property, so it cannot execute the value's own code.
const dateGetTime = Date.prototype.getTime;
const dateToISO = Date.prototype.toISOString;
const mapSize = slotGetter(Map.prototype, 'size');
const setSize = slotGetter(Set.prototype, 'size');
const weakMapHas = WeakMap.prototype.has;
const weakSetHas = WeakSet.prototype.has;
const arrayBufferByteLength = slotGetter(ArrayBuffer.prototype, 'byteLength');
const dataViewByteLength = slotGetter(DataView.prototype, 'byteLength');
const urlHref = slotGetter(URL.prototype, 'href');
const regExpSource = slotGetter(RegExp.prototype, 'source');
const regExpFlags = slotGetter(RegExp.prototype, 'flags');
const uspToString = URLSearchParams.prototype.toString;
// `WeakMap`/`WeakSet` have no slot getter; `has` reaches the brand check before it looks at the key, so any
// object key works purely to provoke that check.
const WEAK_PROBE_KEY = Object.freeze({});
// Captured only where the runtime exposes the constructor; touching an absent global would throw at load.
const weakRefDeref = typeof WeakRef !== 'undefined' ? WeakRef.prototype.deref : undefined;
const sharedArrayBufferByteLength = typeof SharedArrayBuffer !== 'undefined' ? slotGetter(SharedArrayBuffer.prototype, 'byteLength') : undefined;

/**
 * Recognises a genuine instance of `ctor`: `instanceof` is a cheap pre-filter, and the internal-slot probe
 * is the authority. The probe throws on a prototype-spoofed or `Symbol.toStringTag`-branded object, so a
 * hostile/branded object is never misclassified (it falls through and is recursed with its properties
 * intact), and because the probe only reads a built-in slot it never runs the value's own code.
 */
function brandCheck(ctor: Function, probeSlot: (v: object) => unknown): (value: object) => boolean {
    return (value) => {
        if (!(value instanceof ctor)) return false;
        try { probeSlot(value); return true; } catch { return false; }
    };
}

/** A genuine date's ISO string, or `null` for a non-finite date, read via internal-slot accessors that a forgery makes throw — matching `JSON.stringify` and never running the value's own `valueOf`. */
function safeDateISO(v: unknown): string | null {
    try {
        const t = dateGetTime.call(v as Date);
        return Number.isFinite(t) ? dateToISO.call(v as Date) : null;
    } catch {
        return null;
    }
}
/** A genuine URL's href, read through the built-in `href` accessor so a value's own getter cannot run. */
function safeURLHref(v: unknown): string {
    try { return urlHref.call(v) as string; } catch { return ''; }
}
/** A genuine RegExp's `/source/flags`, read through the built-in `source`/`flags` accessors so a planted own getter cannot run. */
function safeRegExpSource(v: unknown): string {
    try { return `/${regExpSource.call(v)}/${regExpFlags.call(v)}`; } catch { return ''; }
}
/** A genuine URLSearchParams' query string, serialised from its internal list so no value-supplied property is read. */
function safeUSPQuery(v: unknown): string {
    try { return uspToString.call(v as URLSearchParams) as string; } catch { return ''; }
}

// Ordered rules, grouped by fidelity. Transparent (a genuine instance has a string JSON keeps) · Labelled
// (JSON gives {}, but a genuine instance has a safe string for the redact trace) · Opaque (no salvageable
// string, JSON gives {}). Every rule recognises its type by an internal-slot brand check, never by a tag.
const OBJECT_RULES: ObjectRule[] = [
    { tag: 'Date', match: brandCheck(Date, (v) => dateGetTime.call(v as Date)), normalise: { to: 'json', value: safeDateISO }, redactDetail: (v) => safeDateISO(v) ?? 'invalid' },
    { tag: 'URL', match: brandCheck(URL, (v) => urlHref.call(v)), normalise: { to: 'json', value: safeURLHref }, redactDetail: safeURLHref },
    { tag: 'RegExp', match: brandCheck(RegExp, (v) => regExpSource.call(v)), normalise: { to: 'empty-object' }, redactDetail: safeRegExpSource },
    { tag: 'URLSearchParams', match: brandCheck(URLSearchParams, (v) => uspToString.call(v as URLSearchParams)), normalise: { to: 'empty-object' }, redactDetail: safeUSPQuery },
    { tag: 'Map', match: brandCheck(Map, (v) => mapSize.call(v)), normalise: { to: 'empty-object' } },
    { tag: 'Set', match: brandCheck(Set, (v) => setSize.call(v)), normalise: { to: 'empty-object' } },
    // A Promise exposes no internal-slot accessor to scripts, so `instanceof` is the only available test;
    // a forged object carrying `Promise.prototype` is therefore the single spoof this cannot reject, and its
    // only effect is a benign `redact:Promise` / `{}` rather than being recursed.
    { tag: 'Promise', match: (v) => v instanceof Promise, normalise: { to: 'empty-object' } },
    { tag: 'WeakMap', match: brandCheck(WeakMap, (v) => weakMapHas.call(v as WeakMap<object, unknown>, WEAK_PROBE_KEY)), normalise: { to: 'empty-object' } },
    { tag: 'WeakSet', match: brandCheck(WeakSet, (v) => weakSetHas.call(v as WeakSet<object>, WEAK_PROBE_KEY)), normalise: { to: 'empty-object' } },
    { tag: 'ArrayBuffer', match: brandCheck(ArrayBuffer, (v) => arrayBufferByteLength.call(v)), normalise: { to: 'empty-object' } },
    { tag: 'DataView', match: brandCheck(DataView, (v) => dataViewByteLength.call(v)), normalise: { to: 'empty-object' } },
    ...(weakRefDeref
        ? [{ tag: 'WeakRef', match: brandCheck(WeakRef, (v) => weakRefDeref.call(v as WeakRef<object>)), normalise: { to: 'empty-object' } } as ObjectRule]
        : []),
    ...(sharedArrayBufferByteLength
        ? [{ tag: 'SharedArrayBuffer', match: brandCheck(SharedArrayBuffer, (v) => sharedArrayBufferByteLength.call(v)), normalise: { to: 'empty-object' } } as ObjectRule]
        : []),
];

// Primitive rules, looked up by `typeof` rather than by a brand check, but reusing the same shape and resolver.
const BIGINT_RULE: NonSerialisableRule = { tag: 'bigint', normalise: { to: 'null' }, redactDetail: (v) => String(v) };
const NAN_RULE: NonSerialisableRule = { tag: 'NaN', normalise: { to: 'null' } };
const INFINITY_RULE: NonSerialisableRule = { tag: 'Infinity', normalise: { to: 'null' } };
const FUNCTION_RULE: NonSerialisableRule = { tag: 'Function', normalise: { to: 'drop' } };
const SYMBOL_RULE: NonSerialisableRule = { tag: 'Symbol', normalise: { to: 'drop' } };

/** Rule for a property defined by a getter the clone refused to execute. */
export const GETTER_RULE: NonSerialisableRule = { tag: 'Getter', normalise: { to: 'drop' } };

/** The non-serialisable rule for an object, found by brand-checking each built-in; `undefined` for a cleanly-walkable plain object/array/class instance. */
export function matchRule(value: object): NonSerialisableRule | undefined {
    for (const rule of OBJECT_RULES) {
        if (rule.match(value)) return rule;
    }
    return undefined;
}

/**
 * The non-serialisable rule for a primitive, or `undefined` for a JSON-native primitive (finite number,
 * string, boolean). Detects bigint, non-finite numbers (NaN/±Infinity), functions and symbols by `typeof`.
 */
export function primitiveRule(value: unknown): NonSerialisableRule | undefined {
    switch (typeof value) {
        case 'bigint': return BIGINT_RULE;
        case 'number': return Number.isFinite(value) ? undefined : Number.isNaN(value) ? NAN_RULE : INFINITY_RULE;
        case 'function': return FUNCTION_RULE;
        case 'symbol': return SYMBOL_RULE;
        default: return undefined;
    }
}

/** Apply a matched rule under the active mode → the value to assign, or a drop. */
export function resolveNonSerialisable(rule: NonSerialisableRule, value: unknown, mode: NonSerialisableHandling): LeafResolution {
    if (mode === 'drop') return { kind: 'drop' };
    if (mode === 'redact') {
        const detail = rule.redactDetail?.(value);
        return { kind: 'value', value: detail !== undefined ? `redact:${rule.tag}:${detail}` : `redact:${rule.tag}` };
    }
    switch (rule.normalise.to) {
        case 'json': return { kind: 'value', value: rule.normalise.value(value) };
        case 'empty-object': return { kind: 'value', value: {} };
        case 'null': return { kind: 'value', value: null };
        case 'drop': return { kind: 'drop' };
    }
}

/**
 * Every `<tag>` the module can emit as a `redact:<tag>` marker — the closed allow-list the strip step uses
 * to recognise its own markers and mask only their detail, never the prefix.
 */
export const REDACT_MARKER_TAGS: ReadonlySet<string> = new Set<string>([
    ...OBJECT_RULES.map((rule) => rule.tag),
    'bigint', 'NaN', 'Infinity', 'Function', 'Symbol', 'Getter',
]);
