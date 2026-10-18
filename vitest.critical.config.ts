import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Per-file coverage gate for the critical paths.
 *
 * The global gate in `test:coverage:core` lives in `src/lib` and reports an
 * aggregate, which is how `useOptimizeRunner.ts` sat at 74.3% statements for a
 * long time while the repo-wide number looked healthy at 96%+. This config
 * restricts coverage to the four files that carry the product's core logic and
 * applies the thresholds to EACH file rather than to the average.
 *
 * Thresholds lock the post-2026-10-18 state and fail on regression. Ratchet
 * history: 80/60/65 → 95/80/90 after closing the `useOptimizeRunner.ts`
 * streaming/guest/sync branches (98.81 stmts, 90.97 branches, 98.03 funcs,
 * 100% lines). Raise again only with new measured minima and safe margins.
 *
 * NOTE: these thresholds MUST be per-file. Passing them as a global average
 * would let one strong file mask a weak one, which is the exact failure this
 * config exists to prevent.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    env: { NODE_ENV: "test" },
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/hooks/useOptimizeRunner.test.ts",
      "src/lib/historyMerge.test.ts",
      "src/lib/promptScore.test.ts",
      "src/lib/auth/rateLimit.test.ts",
    ],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text"],
      include: [
        "src/hooks/useOptimizeRunner.ts",
        "src/lib/historyMerge.ts",
        "src/lib/promptScore.ts",
        "src/lib/auth/rateLimit.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 95,
        branches: 80,
        functions: 90,
      },
    },
  },
  resolve: {
    conditions: ["development", "browser", "module"],
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
