import {  midnight, promiseWithTrigger, sleep } from "./misc"


import { ContentEditable } from "./content-editable"
import fuzzySubString, { FuzzySubString } from "./fuzzySubString"
import validateRangeMatchesRules, { RangeRules } from "./range-rules"
import { EnsureAllMethodsAreAsync } from "./types/EnsureAllMethodsAreAsync"
import isTypeEqual from "./types/isTypeEqual"
import isTypeExtended from "./types/isTypeExtended"

export {sleep, promiseWithTrigger, midnight}


export {ContentEditable};
export {fuzzySubString};

export {
    isTypeEqual,
    isTypeExtended
}

export {validateRangeMatchesRules};

export * from "./uid/uid";

export * as CryptoHelpers from "./crypto-helpers";
export * as EmailHelpers from "./email-helpers";


export type {
    EnsureAllMethodsAreAsync,
    RangeRules,
    FuzzySubString
}