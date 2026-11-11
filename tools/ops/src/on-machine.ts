// Runs a command inside the API's Machine of `tadayo-api-dev` (docs/plans/api-b0-deploy.md, section
// 6; TECH-DESIGN sections 8 and 9; T56). Some of what `ops` does needs Supabase's service key, which
// lives only in Fly's secrets (the app's own secrets, set by the founder): `storage-setup`, and the
// API half of the Supabase probe. So the runner starts the same script on the Machine, with
// `--here`, and reads what it printed.
//
// `flyctl machine exec` needs only the API token (no tunnel, no SSH), runs the command in a started
// Machine, and answers once, as JSON, when the command ends: `{stdout, stderr, exit_code}`. It
// exits 0 even when the command failed, so the exit code is read from the answer. It is limited to
// 600 seconds; this asks for 300.
//
// Whether the command sees the Machine's secrets is the one thing Fly's documentation doesn't say
// for `machine exec` (it does for `fly ssh console`); the first run after slice 10b shows it, and
// docs/LIMITATIONS.md says what to do if it doesn't.

import { DEV_APP } from "./environment.ts";
import { jsonOf, machines, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

export interface OnMachineInput {
  readonly fly: Fly;
  /** The script's name, for the messages. */
  readonly label: string;
  /** The command's words, which go to the Machine as one line. */
  readonly command: readonly string[];
  readonly say: (line: string) => void;
}

const EXEC_SECONDS = 300;
// The call is given a little longer than the command, so that flyctl's own timeout is the one that speaks.
const CALL_MS = (EXEC_SECONDS + 30) * 1000;
const PLAIN_WORD = /^[A-Za-z0-9._/:=@-]+$/;

const linesOf = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

export async function onMachine(input: OnMachineInput): Promise<void> {
  const { fly, label, say } = input;
  if (input.command.length === 0 || !input.command.every((word) => PLAIN_WORD.test(word))) {
    throw new OpsError(`${label}: a command for the Machine is plain words: letters, digits and . _ / : = @ -`);
  }
  const target = (await machines(fly)).find((machine) => machine.group === "api" && machine.state === "started");
  if (target === undefined) throw new OpsError(`${label}: the API has no started Machine; deploy first`);

  const result = await fly.run(
    ["machine", "exec", target.id, input.command.join(" "), "-a", DEV_APP, "--json", "--timeout", String(EXEC_SECONDS)],
    { timeoutMs: CALL_MS },
  );
  if (result.code !== 0) throw new OpsError(`${label}: flyctl couldn't run it on the Machine: ${why(result)}`);

  const answer = jsonOf(result);
  const body =
    typeof answer === "object" && answer !== null && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
  const exitCode = body["exit_code"];
  if (typeof exitCode !== "number")
    throw new OpsError(`${label}: flyctl's answer about the command isn't one it can read`);
  for (const stream of ["stdout", "stderr"]) {
    const printed = body[stream];
    if (typeof printed === "string") for (const line of linesOf(printed)) say(line);
  }
  if (exitCode !== 0) throw new OpsError(`${label}: it failed on the Machine, with exit code ${String(exitCode)}`);
}
