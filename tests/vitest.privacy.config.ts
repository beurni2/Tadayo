import { defineConfig } from "vitest/config";

// The privacy matrix and the leak scanner (the ci step `privacy`; TECH-DESIGN section 8): every
// route of the API's app, as every role, in every state of the drop and phase of the day, against
// the Postgres the database tests use, migrated once as `tadayo_app` first. Files run one at a
// time, since they share it; a role's sweep runs tens of thousands of requests, so a test may take
// minutes.
export default defineConfig({
  test: {
    include: ["src/privacy/**/*.test.ts"],
    globalSetup: ["src/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
