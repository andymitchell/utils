import { ChromeStorage } from "../ChromeStorage.ts";
import { MockChromeStorageArea } from "./MockChromeStorageArea.ts";

export const inMemoryChromeStorage = new ChromeStorage(new MockChromeStorageArea());