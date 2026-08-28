import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/utility.ts"),
      fileName: () => "utility.cjs",
      formats: ["cjs"],
    },
  },
});
