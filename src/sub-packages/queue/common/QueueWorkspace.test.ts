
import { QueueWorkspace } from "./QueueWorkspace";


describe('QueueWorkspace', () => {

    test('Simply runs', async () => {

        const qw = new QueueWorkspace();

        const result1 = await qw.enqueue('TEST_QW', async () => {
            return 123;
        });

        expect(result1).toBe(123);
        

        await qw.dispose();
    }, 1000*10)

})