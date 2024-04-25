import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {
    'index': "src/index.ts",
    'typed-cancelable-event-emitter': "src/sub-packages/typed-cancelable-event-emitter/index.ts",
    'fake-idb': "src/sub-packages/fake-idb/index.ts",
    'dom-helpers': "src/sub-packages/dom-helpers/index.ts",
    'queue': "src/sub-packages/queue/index.ts",
  },
  publicDir: false,
  clean: true,
  target: ['es2020'],
  minify: false,
  dts: true,
  format: ['cjs', 'esm'], // When this changes, update 'type' in package.json 
});