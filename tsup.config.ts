import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {
    'index': "src/index.ts",
    'index-browser': "src/index-browser.ts",
    'index-node': "src/index-node.ts",

    'typed-cancelable-event-emitter': "src/sub-packages/typed-cancelable-event-emitter/index.ts",
    'fake-idb': "src/sub-packages/fake-idb/index.ts",
    'dom-helpers': "src/sub-packages/dom-helpers/index.ts",
    'react-helpers': "src/sub-packages/react-helpers/index.ts",
    'crypto-helpers': "src/sub-packages/crypto-helpers/index.ts",
    'uid': "src/sub-packages/uid/index.ts",
    'fetch-pacer': "src/sub-packages/fetch-pacer/index.ts",
    
    'deep-clone-scalar-values': "src/sub-packages/deep-clone-scalar-values/index.ts",

    'logging': "src/sub-packages/logging/index.ts",
    'logging-browser': "src/sub-packages/logging/index-browser.ts",
    'logging-node': "src/sub-packages/logging/index-node.ts",

    'kv-storage': "src/sub-packages/kv-storage/index.ts",
    'kv-storage-browser': "src/sub-packages/kv-storage/index-browser.ts",
    'kv-storage-node': "src/sub-packages/kv-storage/index-node.ts",

    'queue': "src/sub-packages/queue/index.ts",
    'queue-browser': "src/sub-packages/queue/index-browser.ts",
    'queue-node': "src/sub-packages/queue/index-node.ts",
    'queue-memory': "src/sub-packages/queue/index-memory.ts",
    'queue-idb': "src/sub-packages/queue/index-idb.ts",
    'queue-testing': "src/sub-packages/queue/index-testing.ts",

    'queue-sql': "src/sub-packages/queue-sql/index.ts",
  },
  publicDir: false,
  clean: true,
  target: ['esnext'],
  minify: false,
  splitting: true,
  external: [
    'dexie',
    'zod',
    'drizzle-orm',
    'postgres'
  ],
  dts: true,
  format: ['esm'], // When this changes, update 'type' in package.json 
});