import { MemoryStorage } from "../index-node.ts";
import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { DeferredKvStorage } from "./DeferredKvStorage.ts";

commonAdapterTests(() => new DeferredKvStorage(async () => new MemoryStorage()));