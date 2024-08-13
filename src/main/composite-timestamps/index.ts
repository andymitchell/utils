import { type CompositeTimestamp, CompositeTimestampSchema, createCompositeTimestamp, type FlexibleTimestamp, FlexibleTimestampSchema, gtCompositeTimestamp, gteCompositeTimestamp, incrementCompositeTimestampIndex, isCompositeTimestamp, isNumericTimestamp, sortCompositeTimestamp } from "./compositeTimestamp";

export {
    CompositeTimestampSchema,
    FlexibleTimestampSchema,

    isNumericTimestamp,
    isCompositeTimestamp,

    createCompositeTimestamp,
    incrementCompositeTimestampIndex,
    sortCompositeTimestamp,
    gtCompositeTimestamp,
    gteCompositeTimestamp
}

export type {
    CompositeTimestamp,
    FlexibleTimestamp
}