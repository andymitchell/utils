export type RangeRules = {
    denyIntersectAnchors?: boolean
    denyIntersectAnyBlock?: boolean
}

export type ValidatedRangeRules = {
    ok: true,
    broken?: undefined
} | {
    ok: false, 
    broken: keyof RangeRules
}