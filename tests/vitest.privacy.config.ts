import { defineConfig } from "vitest/config";

// The privacy matrix and the leak scanner (the ci step `privacy`; TECH-DESIGN section 8): every
// route of the API's app, as every role, in every state of the drop and phase of the day, on the
// Postgres the database tests use but in a database of its own: the one they use, migrated once as
// `tadayo_app`, copied afresh for each run (./src/privacy/global-setup.ts; the outside audit's B8),
// so the worlds the matrix commits never reach theirs. Files run one at a time, since they share
// it; a role's sweep runs tens of thousands of requests, so a test may take minutes.
export default defineConfig({
  test: {
    include: ["src/privacy/**/*.test.ts"],
    globalSetup: ["src/privacy/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
