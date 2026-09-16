import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/integration/global-setup.ts"],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
