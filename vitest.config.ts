import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "custom-repo-starter/__tests__/**/*.test.ts"],
    exclude: ["node_modules"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      // Ratchet floor: set just below current measured coverage so it guards
      // against regression without going red today. Raise as the spine gains
      // tests — never lower these to make a PR pass.
      thresholds: {
        statements: 52,
        branches: 44,
        functions: 50,
        lines: 54,
      },
      exclude: [
        "node_modules/**",
        "src/__tests__/**",
        "**/*.config.*",
        "**/*.d.ts",
        ".next/**",
        "scripts/**",
        // Drop-in components for client repos — tested via their own helpers,
        // but not part of the control-plane coverage ratchet.
        "custom-repo-starter/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
