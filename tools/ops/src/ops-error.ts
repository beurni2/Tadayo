// A refusal or a failure of an `ops` script that is meant to be read by the person who started
// it. Its message names variables, files and checks, never a value that came from the environment
// (T52, T56); the entry prints it as it is, and prints any other error's message only after
// redacting every secret it knows (output.ts).

export class OpsError extends Error {
  override readonly name = "OpsError";
}
