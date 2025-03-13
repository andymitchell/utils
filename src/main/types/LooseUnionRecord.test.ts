import isPropertyRequired from "./isPropertyRequired.ts";
import type { LooseUnionRecord } from "./LooseUnionRecord.ts";


function it() {
    type TestUnion = {ok: true, name: string} | {ok: false, error: any};
    type TestUnionLoose = LooseUnionRecord<TestUnion>;

    const a:TestUnionLoose = {ok: true, name: 'Bob'};
    a.error; // OK to directly address it without union conditional check
    isPropertyRequired<TestUnionLoose, 'ok'>(true);
    

    
}
