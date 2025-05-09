import {  type PromiseWithTrigger, convertArrayToRecord, dLog, dLogDebug, dLogWarn, getGlobal, midnight, promiseWithTrigger, sleep } from "./misc.ts"


import { ContentEditable } from "./content-editable/index.ts"
import fuzzySubString, { type FuzzySubString } from "./fuzzySubString/index.ts"
import validateRangeMatchesRules, { type RangeRules } from "./range-rules/index.ts"
import type { EnsureAllMethodsAreAsync } from "./types/EnsureAllMethodsAreAsync.ts"
import isTypeEqual, {isTypeEqualIgnoringPartials} from "./types/isTypeEqual.ts"
import isTypeExtended from "./types/isTypeExtended.ts"
import typeHasKeys from "./types/typeHasKeys.ts"
import { applyPlaceholderToTemplateStringFunction, convertPlaceholderToTemplateStringsArray } from "./convert-placeholder-to-template-strings-array/index.ts"
import { loosenUnionRecordType, type LooseUnionRecord } from "./types/LooseUnionRecord.ts"
import  isPropertyRequired from "./types/isPropertyRequired.ts"



export {
    sleep, 
    promiseWithTrigger, 
    convertArrayToRecord,
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
    typeHasKeys,
    isPropertyRequired,
    loosenUnionRecordType
}

export {validateRangeMatchesRules};

export {
    convertPlaceholderToTemplateStringsArray,
    applyPlaceholderToTemplateStringFunction
}

export * as EmailHelpers from "./email-helpers/index.ts";
export * as PostgresHelpers from './db/postgres/index.js';
export * from './moveObjectToFrontOfArray.ts'

export type {
    EnsureAllMethodsAreAsync,
    LooseUnionRecord,
    RangeRules,
    FuzzySubString,
    PromiseWithTrigger,
}