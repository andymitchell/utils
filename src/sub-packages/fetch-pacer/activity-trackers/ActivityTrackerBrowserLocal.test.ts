import { MockChromeStorageArea } from "../../kv-storage/index.ts"
import type { ActivityItem } from "../types.ts";
import { ActivityTrackerBrowserLocal } from "./ActivityTrackerBrowserLocal.ts";

describe('shared db', () => {


    test(`2 instances will stay in sync`, async () => {

        const storage = new MockChromeStorageArea();

        const i1 = new ActivityTrackerBrowserLocal('', {}, storage);
        const i2 = new ActivityTrackerBrowserLocal('', {}, storage);

        const item:ActivityItem = {
            type: 'success',
            points: 1,
            timestamp: Date.now()
        }
        await i1.add(item)

        const resultI2 = await i2.list();
        expect(resultI2.length).toBe(1);

        const resultI1 = await i1.list();

        expect(resultI2).toEqual(resultI1);

    })

})