import { getGlobal } from "./misc"

test('getGlobal', () => {
    const glob = getGlobal();
    expect(!!glob).toBe(true);
})