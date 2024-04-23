import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {
    'index': "src/utils/index.ts",
    'typed-cancelable-event-emitter': "src/standalone/typed-cancelable-event-emitter/index.ts",
    'fake-idb': "src/standalone/fake-idb/index.ts",
    'dom-helpers': "src/standalone/dom-helpers/index.ts",
  },
  publicDir: false,
  clean: true,
  minify: false,
  dts: true,
  format: ['cjs', 'esm'], // When this changes, update 'type' in package.json 
});