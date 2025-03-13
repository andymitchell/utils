import isPropertyRequired from "./isPropertyRequired.ts";
import { loosenUnionRecordType, type LooseUnionRecord } from "./LooseUnionRecord.ts";


test('type', () => {
    type TestUnion = {ok: true, name: string} | {ok: false, error: any};
    type TestUnionLoose = LooseUnionRecord<TestUnion>;

    const a:TestUnionLoose = {ok: true, name: 'Bob'};
    a.error; // OK to directly address it without union conditional check
    isPropertyRequired<TestUnionLoose, 'ok'>(true);
    
    
    
})

test('function', () => {
    function getTest():TestUnion {
        // @ts-ignore Don't tell the compiler exactly what it's returning as it might narrow 
        return {}
    }
    
    type TestUnion = {ok: true, name: string} | {ok: false, error: any};
    const obj:TestUnion = getTest();
    const finalObj = loosenUnionRecordType(obj);

    finalObj.error; // OK to directly address it without union conditional check
    isPropertyRequired<typeof finalObj, 'ok'>(true);
    
    
    
})