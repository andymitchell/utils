import { TestSqlDbGenerator, type TestDatabases, createSchemaDefinitionFile } from "@andyrmitchell/drizzle-fast-bulk-test";
import { QueueTable } from "./table-creators/types";
import { queueTableCreatorPg } from "./table-creators/queue.pg";
import { CommonDatabases } from "./types";




type RawStoreTestSqlDb<D extends CommonDatabases = CommonDatabases> = {instance_id: number, db:TestDatabases[D], schemas: QueueTable[D], used?: boolean};

export class RawStoreTestSqlDbGenerator<D extends CommonDatabases = CommonDatabases> {

    
    #testSqlDbGenerator:TestSqlDbGenerator<D, QueueTable[D]>;
    

    constructor(testDirAbsolutePath:string, dialect:CommonDatabases = 'pg', batch_size = 1) {
        


        this.#testSqlDbGenerator = new TestSqlDbGenerator<D, QueueTable[D]>(
            testDirAbsolutePath, 
            {
                dialect,
                batch_size,
                generate_schemas_for_batch: async (batchPositions, batchTestDirAbsolutePath) => {
                    
                    const partitioned_schemas = batchPositions.map(batch_position => {
                        const storeId = `store${batch_position}`;
                        return {
                            batch_position,
                            store_id: storeId,
                            schemas: queueTableCreatorPg(storeId)
                        }
                    })

                    const migration_file_absolute_path = createSchemaDefinitionFile({
                        'test_dir_absolute_path': batchTestDirAbsolutePath,
                        'table_creator_import': {
                            link_file_pattern: 'queue.pg.ts',
                            import_name: '{queueTableCreatorPg}'
                        },
                        'table_creator_invocation': (storeIds) => storeIds.map(storeId => `export const store_${storeId} = queueTableCreatorPg('${storeId}');`).join("\n")
                     },
                    partitioned_schemas.map(x => x.store_id));

                    return {
                        partitioned_schemas,
                        migration_file_absolute_path
                    }
                }
            }
        )
    }

    async nextTest():Promise<RawStoreTestSqlDb<D>> {

        return await this.#testSqlDbGenerator.nextTest();


        
    }
}
