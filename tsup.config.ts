import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: {
    'index': "src/index.ts",
    'typed-cancelable-event-emitter': "src/utils/typed-cancelable-event-emitter/index.ts"
  },
  publicDir: false,
  clean: true,
  minify: false,
  dts: true,
  format: ['cjs', 'esm'], // When this changes, update 'type' in package.json 
});