// Runs a command inside the API's Machine of `tadayo-api-dev` (docs/plans/api-b0-deploy.md, section
// 6; TECH-DESIGN sections 8 and 9; T56). Some of what `ops` does needs Supabase's service key, which
// lives only in Fly's secrets (the app's own secrets, set by the founder): `storage-setup`, and the
// API half of the Supabase probe. So the runner starts the same script on the Machine, with
// `--here`, and reads what it printed.
//
// `flyctl machine exec` needs only the API token (no tunnel, no SSH), runs the command in a started
// Machine, and answers once, as JSON, when the command ends. It exits 0 even when the command
// failed, so the exit code is read from the answer. The answer is flyctl's own rendering of the
// Machines API's (flyctl 0.5.8, `internal/command/machine/exec.go`, and fly-go's
// `MachineExecResponse`): an object with `stdout`, `stderr` and `exit_code`, each of them LEFT OUT
// when it is empty or zero (Go's `omitempty`). So a command that worked answers `{"stdout": "…"}`
// with no `exit_code` at all, and one that printed nothing answers `{}`; only a failure names its
// code. The answer is read strictly because a missing code means "worked": nothing but those keys
// (and `exit_signal`, the Machines API's own, which a later flyctl may print), each of the right
// type, is accepted, so a flyctl that renamed the code, or an answer of another kind, fails the
// script instead of passing as a success. The workflow pins the flyctl version this was checked
// against (slice 10b). `machine exec` is limited to 600 seconds; this asks for 300.
//
// Whether the command sees the Machine's secrets is the one thing Fly's documentation doesn't say
// for `machine exec` (it does for `fly ssh console`); the first run after slice 10b shows it, and
// docs/LIMITATIONS.md says what to do if it doesn't.

import { DEV_APP } from "./environment.ts";
import { jsonOf, machineList, machines, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

export interface OnMachineInput {
  readonly fly: Fly;
  /** The script's name, for the messages. */
  readonly label: string;
  /** The command's words, which go to the Machine as one line. */
  readonly command: readonly string[];
  readonly say: (line: string) => void;
}

/** How long `flyctl machine exec` lets the command run before it ends it (the Machine's, not the call's). */
export const EXEC_SECONDS = 300;
// The call is given a little longer than the command, so that flyctl's own timeout is the one that speaks.
const CALL_MS = (EXEC_SECONDS + 30) * 1000;
const PLAIN_WORD = /^[A-Za-z0-9._/:=@-]+$/;

const linesOf = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/** The only keys of an answer that is one: `flyctl` leaves out the ones that are empty or zero. */
const ANSWER_KEYS = ["stdout", "stderr", "exit_code", "exit_signal"];

interface Answer {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly exitSignal: number;
}

/** What `flyctl machine exec --json` printed, or nothing when that isn't an answer of its kind. */
function readAnswer(printed: unknown): Answer | undefined {
  if (typeof printed !== "object" || printed === null || Array.isArray(printed)) return undefined;
  const body = printed as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ANSWER_KEYS.includes(key))) return undefined;
  const { stdout = "", stderr = "", exit_code: exitCode = 0, exit_signal: exitSignal = 0 } = body;
  if (typeof stdout !== "string" || typeof stderr !== "string") return undefined;
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) return undefined;
  if (typeof exitSignal !== "number" || !Number.isInteger(exitSignal)) return undefined;
  return { stdout, stderr, exitCode, exitSignal };
}

export async function onMachine(input: OnMachineInput): Promise<void> {
  const { fly, label, say } = input;
  if (input.command.length === 0 || !input.command.every((word) => PLAIN_WORD.test(word))) {
    throw new OpsError(`${label}: a command for the Machine is plain words: letters, digits and . _ / : = @ -`);
  }
  const all = await machines(fly);
  const target = all.find((machine) => machine.group === "api" && machine.state === "started");
  if (target === undefined) {
    // A Machine that crashed is restarted a few times and then left stopped (fly.toml's `[[restart]]`),
    // and deploying again leaves it stopped: what it died of is in Fly's log, which no script reads.
    const advice = all.some((machine) => machine.group === "api")
      ? `if it stopped on its own, Fly's log of ${DEV_APP} says why`
      : "deploy first";
    throw new OpsError(`${label}: the API has no started Machine (the app's Machines: ${machineList(all)}); ${advice}`);
  }

  const result = await fly.run(
    ["machine", "exec", target.id, input.command.join(" "), "-a", DEV_APP, "--json", "--timeout", String(EXEC_SECONDS)],
    { timeoutMs: CALL_MS },
  );
  if (result.code !== 0) throw new OpsError(`${label}: flyctl couldn't run it on the Machine: ${why(result)}`);

  const answer = readAnswer(jsonOf(result));
  if (answer === undefined) throw new OpsError(`${label}: flyctl's answer about the command isn't one it can read`);
  for (const text of [answer.stdout, answer.stderr]) for (const line of linesOf(text)) say(line);
  if (answer.exitCode !== 0) {
    throw new OpsError(`${label}: it failed on the Machine, with exit code ${String(answer.exitCode)}`);
  }
  if (answer.exitSignal !== 0) {
    throw new OpsError(`${label}: it was ended on the Machine by signal ${String(answer.exitSignal)}`);
  }
}
