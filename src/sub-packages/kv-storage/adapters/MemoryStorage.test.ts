import { commonAdapterTests } from "../testing-helpers/commonAdapterTests.ts";
import { MemoryStorage } from "./MemoryStorage.ts";

commonAdapterTests(() => new MemoryStorage());