import { ChromeStorage } from "./ChromeStorage.ts"
import { MockChromeStorageArea } from "../testing-helpers/MockChromeStorageArea.ts"
import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts"


commonAdapterTests(() => new ChromeStorage(new MockChromeStorageArea()));
