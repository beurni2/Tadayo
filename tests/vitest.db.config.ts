import { defineConfig } from "vitest/config";

// The database tests (the ci step `db-tests`): one Postgres, made like ci's (ADR-026), migrated
// once as `tadayo_app` before any file runs. Files run one at a time, since they share it.
export default defineConfig({
  test: {
    include: ["src/db/**/*.test.ts"],
    globalSetup: ["src/db/global-setup.ts"],
    fileParallelism: false,
  },
});
