// Scratch only (the breakage run): migrates as the database tests' setup does, and prints what it refuses.
import { setup } from "./src/db/global-setup.ts";
try {
  await setup();
  console.log("migrated");
} catch (error) {
  console.log("× migrate refused: " + (error instanceof Error ? error.message : String(error)).slice(0, 400));
  process.exitCode = 1;
}
