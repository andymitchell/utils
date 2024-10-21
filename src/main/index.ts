import {  PromiseWithTrigger, dLog, dLogDebug, dLogWarn, getGlobal, midnight, promiseWithTrigger, sleep } from "./misc"


import { ContentEditable } from "./content-editable"
import fuzzySubString, { FuzzySubString } from "./fuzzySubString"
import validateRangeMatchesRules, { RangeRules } from "./range-rules"
import { EnsureAllMethodsAreAsync } from "./types/EnsureAllMethodsAreAsync"
import isTypeEqual, {isTypeEqualIgnoringPartials} from "./types/isTypeEqual"
import isTypeExtended from "./types/isTypeExtended"
import typeHasKeys from "./types/typeHasKeys"
import { convertPlaceholderToTemplateStringsArray } from "./convert-placeholder-to-template-strings-array"



export {
    sleep, 
    promiseWithTrigger, 
    midnight,
    dLog,
    dLogDebug,
    dLogWarn,
    getGlobal
}


export {ContentEditable};
export {fuzzySubString};

export {
    isTypeEqual,
    isTypeEqualIgnoringPartials,
    isTypeExtended,
    typeHasKeys
}

export {validateRangeMatchesRules};

export {
    convertPlaceholderToTemplateStringsArray
}

export * from "./uid/uid";

export * as CryptoHelpers from "./crypto-helpers";
export * as EmailHelpers from "./email-helpers";
export * as PostgresHelpers from './db/postgres';


export type {
    EnsureAllMethodsAreAsync,
    RangeRules,
    FuzzySubString,
    PromiseWithTrigger,
}