import {  type PromiseWithTrigger, convertArrayToRecord, dLog, dLogDebug, dLogWarn, getGlobal, isTest, midnight, promiseWithTrigger, sleep } from "./misc.ts"


import type { EnsureAllMethodsAreAsync } from "./types/EnsureAllMethodsAreAsync.ts"
import isTypeEqual, {isTypeEqualIgnoringPartials} from "./types/isTypeEqual.ts"
import isTypeExtended from "./types/isTypeExtended.ts"
import typeHasKeys from "./types/typeHasKeys.ts"
import { applyPlaceholderToTemplateStringFunction, convertPlaceholderToTemplateStringsArray } from "./convert-placeholder-to-template-strings-array/index.ts"
import { loosenUnionRecordType, type LooseUnionRecord } from "./types/LooseUnionRecord.ts"
import  isPropertyRequired from "./types/isPropertyRequired.ts"
import { reduceCharactersToEssentialsForComparison } from "./reduceCharactersToEssentials.ts"



export {
    sleep, 
    promiseWithTrigger, 
    convertArrayToRecord,
    midnight,
    dLog,
    dLogDebug,
    dLogWarn,
    getGlobal,
    reduceCharactersToEssentialsForComparison,
    isTest
}



export {
    isTypeEqual,
    isTypeEqualIgnoringPartials,
    isTypeExtended,
    typeHasKeys,
    isPropertyRequired,
    loosenUnionRecordType
}


export {
    convertPlaceholderToTemplateStringsArray,
    applyPlaceholderToTemplateStringFunction
}


export * as PostgresHelpers from './db/postgres/index.js';
export * from './moveObjectToFrontOfArray.ts'

export type {
    EnsureAllMethodsAreAsync,
    LooseUnionRecord,
    PromiseWithTrigger,
}