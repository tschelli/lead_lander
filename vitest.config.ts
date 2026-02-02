import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lead_lander/config-schema": path.resolve(__dirname, "packages/config-schema/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts", "tests/**/*.test.ts"]
  }
});
