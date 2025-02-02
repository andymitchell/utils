import {  PromiseWithTrigger, dLog, dLogDebug, dLogWarn, getGlobal, midnight, promiseWithTrigger, sleep } from "./misc.ts"


import { ContentEditable } from "./content-editable/index.ts"
import fuzzySubString, { FuzzySubString } from "./fuzzySubString/index.ts"
import validateRangeMatchesRules, { RangeRules } from "./range-rules/index.ts"
import { EnsureAllMethodsAreAsync } from "./types/EnsureAllMethodsAreAsync.ts"
import isTypeEqual, {isTypeEqualIgnoringPartials} from "./types/isTypeEqual.ts"
import isTypeExtended from "./types/isTypeExtended.ts"
import typeHasKeys from "./types/typeHasKeys.ts"
import { applyPlaceholderToTemplateStringFunction, convertPlaceholderToTemplateStringsArray } from "./convert-placeholder-to-template-strings-array/index.ts"



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
    convertPlaceholderToTemplateStringsArray,
    applyPlaceholderToTemplateStringFunction
}

export * as EmailHelpers from "./email-helpers/index.ts";
export * as PostgresHelpers from './db/postgres/index.js';


export type {
    EnsureAllMethodsAreAsync,
    RangeRules,
    FuzzySubString,
    PromiseWithTrigger,
}