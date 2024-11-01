import { ChromeStorage } from "../ChromeStorage";
import { MockChromeStorageArea } from "./MockChromeStorageArea";

export const inMemoryChromeStorage = new ChromeStorage(new MockChromeStorageArea());