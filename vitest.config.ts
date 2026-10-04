import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Phase 2 Final Acceptance: Groq integration tests require a live external API
    // and are excluded from the default CI/deterministic test run.
    // Run them separately with: pnpm test:live
    exclude: ["server/groq.integration.test.ts"],
    testTimeout: 30000,
    // Run test files sequentially to prevent MRN counter race conditions.
    // The mrn_counter table is a shared DB sequence; parallel test files that
    // call consumeNextMRN() concurrently can get the same MRN value and cause
    // ER_DUP_ENTRY errors on the patients.mrn unique index.
    fileParallelism: false,
  },
});
