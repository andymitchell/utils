import {  sleep, uid } from "./utils"
import { CryptoHelpers } from "./utils/CryptoHelpers"
import { DOMHelpers } from "./utils/DOMHelpers"
import { EmailHelpers } from "./utils/EmailHelpers"
import { ContentEditable } from "./utils/content-editable"
import fuzzySubString, { FuzzySubString } from "./utils/fuzzySubString"
import { FakeIdb, fakeIdb } from "./utils/idb-testing"
import validateRangeMatchesRules, { RangeRules } from "./utils/range-rules"
import reduceCharactersToEssentials from "./utils/reduceCharactersToEssentials"
import { TypedCancelableEventEmitter } from "./utils/typedCancelableEventEmitter"
import { EnsureAllMethodsAreAsync } from "./utils/types/EnsureAllMethodsAreAsync"
import isTypeEqual from "./utils/types/isTypeEqual"
import isTypeExtended from "./utils/types/isTypeExtended"

export {uid, sleep}
export {CryptoHelpers};
export {EmailHelpers};
export {DOMHelpers};
export {ContentEditable};
export {fuzzySubString};
export {fakeIdb};
export {TypedCancelableEventEmitter};
export {validateRangeMatchesRules};



export type {
    isTypeEqual,
    isTypeExtended,
    EnsureAllMethodsAreAsync,
    RangeRules,
    FakeIdb,
    FuzzySubString
}