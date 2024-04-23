import {  sleep } from "./utils"
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

export {
    sleep,
    reduceCharactersToEssentials,
    CryptoHelpers, 
    TypedCancelableEventEmitter,
    validateRangeMatchesRules,
    fakeIdb,
    fuzzySubString,
    ContentEditable,
    DOMHelpers,
    EmailHelpers
}

export type {
    isTypeEqual,
    isTypeExtended,
    EnsureAllMethodsAreAsync,
    RangeRules,
    FakeIdb,
    FuzzySubString
}