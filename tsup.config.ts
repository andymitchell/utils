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
  target: ['esnext'],
  minify: false,
  external: [
    'dexie',
    '@andyrmitchell/drizzle-robust-transaction',
    'drizzle-orm'
  ],
  dts: true,
  format: ['esm'], // When this changes, update 'type' in package.json 
});