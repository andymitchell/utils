import { defineConfig } from "tsup";
 
export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  minify: false,
  dts: true,
  target: 'node16',
  format: ['cjs', 'esm', 'iife'], // When this changes, update 'type' in package.json 
});