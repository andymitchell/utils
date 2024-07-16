import { CryptoHelpers } from ".."

describe("CryptoHelpers", () => {
    test("Crypto loads in node", async () => {
        const txt = await CryptoHelpers.sha1Hex("hello world");
        expect(txt).toBe("2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
    })

    test("Crypto generates random string", async () => {
        const txt = await CryptoHelpers.generateRandomString();
        expect(typeof txt).toBe('string');
    })

    test("Crypto generates uuid", async () => {
        const txt = CryptoHelpers.uuid();
        expect(typeof txt).toBe('string');
        expect(txt.length).toBe(36);
    })
})