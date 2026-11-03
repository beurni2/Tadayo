import { defineConfig } from "vitest/config";

// The mock smoke test starts Prism, which takes a few seconds to read the document.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 } });
