import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: ["src/index.ts"],
  publicDir: false,
  clean: true,
  minify: false,
  dts: true,
  format: ['cjs', 'esm'], // When this changes, update 'type' in package.json 
});