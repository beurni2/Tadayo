# api/b0-ops-fresh-agent: an agent and a folder of its own for each SSH session

The api lane's plan for the PR that fixes `deploy-dev`'s first run on `main` (`docs/JOURNAL.md` block 1.2). Written 2026-11-13, from `main` at `03c00e8`.

## 1. Why

PR #52 merged `deploy-dev` as `03c00e8` at about 16:57 UTC on 2026-11-13, and its first run, 43467951472, failed in its `deploy` job at `supabase-probe`, on both attempts (the second started 17:06:30 UTC, after a rerun of the failed job). Each attempt went the same way, about seven seconds apart:

- `migrate` applied nothing, and the API and the worker deployed on `main`'s image;
- `storage-setup` ran over SSH, found both buckets as declared, and removed the WireGuard peer its session made;
- `supabase-probe`'s runner half passed its first check, then its SSH session failed after about seven seconds with `Error: tunnel unavailable: Error contacting Fly.io API when probing "<org>": timed out (context deadline exceeded)`, and the runner found no new peer named for its runner, so none was removed;
- `check-api` didn't run, and neither did `pages`, which waits for `deploy`.

`ops` had run both scripts over SSH five times (`docs/LIMITATIONS.md`, the rows of 2026-11-12), each on a runner of its own. `deploy-dev` is the first to run two SSH sessions in one job, on one runner.

## 2. What was found (flyctl 0.5.8's source, the version `setup-flyctl` pins, read 2026-11-13)

- **One agent per configuration folder.** `flyctl ssh console` asks flyctl's agent for a tunnel; the agent listens on `fly-agent.sock` in the configuration folder (`agent/agent.go`, `PathToSocket`), which is `FLY_CONFIG_DIR` when that is set and `$HOME/.fly` otherwise (`helpers/config.go`, `GetConfigDirectory`, read by both `flyctl/flyctl.go` and `internal/cmdutil/preparers/preparers.go`). The first call starts the agent as a daemon, and every later call on the runner talks to the same one.
- **The agent keeps its tunnel.** `buildTunnel` (`agent/server/server.go`) gives back the tunnel it already holds for the organization, unless it is asked to make a new one, and the agent closes a tunnel only when the configuration has no peer for the organization (`validateTunnelsUnlocked`). The runner's clean-up (`tools/ops/src/on-machine.ts`, `removeThisRunsPeers`; ADR-034) removes the session's peer at Fly with `flyctl wireguard remove`, whose `PruneInvalidPeers` is all that would touch the configuration: it drops a peer from it only when Fly's validation calls that peer invalid. Why it didn't clear the peer in this run isn't known (Fly's validation may lag the removal, or the agent may not have read the configuration again before the next session); what the run shows is that the next session used the old tunnel or the old peer, never a new one.
- **So the second session got a dead tunnel.** It made no peer (the runner's list after it had none of this runner's), and the agent's one check of the tunnel, a DNS lookup of at most five seconds over it (`probeTunnel`, `agent/client.go` `WaitForTunnel`), timed out, as a tunnel to a peer Fly no longer has would. That matches both attempts line for line; a fresh runner per script, as `ops` has, never meets it. It isn't the five-second check of the row of 2026-11-12, which a new tunnel could fail: the session made no new tunnel.
- **An agent of the call's own.** With `FLY_AGENT_ISOLATED` set to a truthy word (`1`, `t`, `true`, `ok`), flyctl runs an agent for that one invocation, as a plain child on a socket in a new 0700 folder of its own under the temporary folder (`agent/agent.go`, `randomSocketPath`; `agent/start.go`, `StartDaemon`). The child's standard output and error go nowhere (Go's default), so the runner's pipes end with flyctl; it holds the read end of a pipe to flyctl as its standard input, and shuts down at that pipe's end, when flyctl exits or is killed (`internal/command/agent/run.go`); it removes its socket folder as it stops.
- **What a fresh folder does to the peers.** `agent.Establish` runs `PruneInvalidPeers` before starting an agent, which asks Fly about the folder's peers; with a fresh folder that is an empty list. It is what the first session on every `ops` runner did, with `$HOME/.fly` fresh, and those runs passed (2026-11-12), so Fly takes the empty list. The agent then finds no peer for the organization in the folder and makes one, named `interactive-<host>-<email>-<ULID>` as before, so the runner's listing before and after the session still finds it, and `flyctl wireguard remove`, which runs with `$HOME/.fly` and no agent, removes it at Fly as before.

## 3. The design

- `tools/ops/src/fly.ts`: `FlyCallOptions.ownAgent`, an absolute path. A call with it gets `FLY_CONFIG_DIR` set to that path and `FLY_AGENT_ISOLATED=1`, beside the token and `HOME`, and nothing else changes: the option itself never reaches `spawn`. A relative or empty path is refused before anything is spawned, so a folder in the working directory (the checkout) is never used.
- `tools/ops/src/on-machine.ts` `onMachine`: once the peers are listed and before the note that a session starts, a new folder is made with `mkdtemp` under the system's temporary folder (`AGENT_FOLDER`, mode 0700), and given to the SSH call alone as its `ownAgent`. The folder is removed in a `finally`, whatever the session did (a failure, a timeout, a throw), because it holds the peer's private key. A folder that can't be made fails the script before any session starts (and before any peer exists); a folder that can't be removed is said, and doesn't fail a script that worked: the peer's removal, which follows, matters more, and the runner ends with the job. The peers' listing and removal calls stay as they are, with `$HOME/.fly`.
- Not done: the token mode (`FLY_WIREGUARD_TOKEN_MODE`), which would make peers at Fly's token gateway instead of through the API and change what the runner lists and removes; and asking the shared agent for a new tunnel (`wireguard reset`), which would make a second peer.

## 4. Tests, written first

- `tools/ops/src/fly.test.ts`:
  - a call with `ownAgent` gets exactly the token, `HOME`, `FLY_CONFIG_DIR` and `FLY_AGENT_ISOLATED=1`, with its own time limit and no `ownAgent` key in what is spawned; the next call without it gets the token and `HOME` only;
  - an empty, relative, `./` or `~/` folder is refused with an `OpsError`, and nothing is spawned.
- `tools/ops/src/on-machine.test.ts`, "onMachine: an agent of the session's own":
  - the SSH call alone gets a new folder, absolute, empty and mode 0700 while the session runs, under the temporary folder, which is gone after the session though flyctl wrote its configuration into it;
  - the folder is removed after a command that failed, a tunnel check that failed and a session that ran out of time;
  - two sessions in one run, as `deploy-dev`'s job has, each get a folder of their own and both succeed, each removing its peer, against a made-up flyctl (`agentFly`) that keeps the WireGuard state as 0.5.8 does: the peers at Fly, each folder's peer, and the shared agent's tunnel, given to the next session though its peer is gone;
  - that made-up flyctl fails as run 43467951472 did when the second session is given the first one's folder (its own agent builds from the folder's dead peer), and when calls have no folder of their own (the shared agent's tunnel), so the test above can't pass by the fake being kind;
  - a folder that can't be made starts no session (the calls stop after the peers' listing) and says why; a folder that can't be removed is said, and the script still succeeds and removes its peer.
- The existing test of what each call is given now expects the SSH call's folder and `FLY_AGENT_ISOLATED=1`, and the token and `HOME` alone for every other call.

## 5. Deliberate breakages

Each change to `fly.ts` or `on-machine.ts` is run against the two test files in a scratch worktree, and counts as caught only when the run fails and its output names the test registered for it (a name prefix): the folder or the word left out, the word given to every call, the option passed on to `spawn`, a relative folder taken, the folder not given to the session, one fixed folder for every session, a folder others may read, the folder not removed or removed only after a session that worked, a removal's failure failing the script, a folder that can't be made said in other words. The patches and the outputs go on the `evidence` branch under `api/b0-ops-fresh-agent/<short-sha>/breakages/`.

## 6. On `dev`, after the merge

`ops` runs only from `main` (`tools/ci/ops_steps.py`, `validated`), and only `deploy-dev` runs two sessions on one runner, so the fix is first seen on Fly when its merge to `main` runs `deploy-dev`. The founder's approval of the PR covers that run, as it did for PR #52; `dev` is claimed through the coordinator before the merge and released after.

- `deploy`: `migrate` applies nothing, the API and the worker deploy on the merge's image, `storage-setup` and then `supabase-probe` each make a peer, run on the Machine and remove their peer, and `check-api` gets the API's neutral 401 through `api-dev.tadayo.app`.
- `pages`: the first run of `pages-project`, `pages-deploy` and `check-association` (they were skipped in run 43467951472). Once it passes, the founder attaches `tadayo.app` to the Pages project `tadayo`, as `docs/JOURNAL.md` block 1.2 says.
- If `storage-setup` fails where it passed before, the isolated agent is what changed: the run says flyctl's words, nothing ran on the Machine, and the peer listing says whether one was left. Then a PR that reverts this one is opened at once, since `ops`'s two SSH scripts would fail too, and the founder is told. If only `supabase-probe` fails, the run's words say whether it is the tunnel check of 2026-11-12 (a new peer was made and removed), which running the job again may pass, or something else, which I'd look into before anything is run again.

## 7. Records

- `docs/LIMITATIONS.md`: a new row for the shared agent's tunnel, seen on run 43467951472, worked around here; the row of 2026-11-12 on the tunnel's one check says that run's failure wasn't that check.
- `docs/JOURNAL.md`: block 1.1's state of `main` and `deploy-dev`; block 1.2 rewritten (#51 and #52 merged, the first run, this PR, the freeze back with the ios lane, `dev` released); the audit map's T56 row; a log entry; this PR's row in table 4.1.
- `docs/PROGRESS.md`, the api lane's section.

## 8. Review

The change handles the folder that holds a WireGuard peer's private key, and what flyctl is given, so it gets full depth: fresh reviewers by lens (flyctl's agent and the runner's processes; the folder's lifetime and what it holds; the tests and the made-up flyctl; the records), each finding put to a refuter, until a round finds nothing of medium or higher. The commit that answers the last round gets a fresh check of its own diff.
