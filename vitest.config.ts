import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Shared local hosts can run several isolated streams at once. Defaults
    // stay Vitest's; explicit runner capacity never changes product clocks.
    ...(process.env.STRELVA_LOCAL_TEST_TIMEOUT_MS ? { testTimeout: Math.max(5000, Math.min(60000, Number(process.env.STRELVA_LOCAL_TEST_TIMEOUT_MS) || 5000)) } : {}),
    ...(process.env.STRELVA_LOCAL_TEST_WORKERS ? { maxWorkers: Math.max(1, Math.min(4, Number(process.env.STRELVA_LOCAL_TEST_WORKERS) || 1)) } : {}),
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx", "custom-repo-starter/__tests__/**/*.test.ts"],
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
      // The standalone route is a copied client-site template. Point its
      // template-only `@/lib` import at the starter helper for route tests;
      // the application alias below remains unchanged for product code.
      "@/lib/scaffold-forms": path.resolve(__dirname, "custom-repo-starter/scaffold-forms.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
