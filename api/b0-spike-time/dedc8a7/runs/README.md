# Spike S5's runs on `dev`, from `main` at `dedc8a7`

The three `ops` runs of spike S5 (`docs/plans/api-b0-spike-time.md`, sections 8 and 9; the report is `docs/spikes/S5-time.md`), approved by the founder at 03:31 UTC on 2026-11-14, run on Monday 2026-11-16 with `dev` claimed through the coordinator from 11:20 to 11:52 UTC. Each was started from `main` at `dedc8a7` through GitHub's REST API (`POST .../actions/workflows/ops.yml/dispatches`), once the one before had ended, with no `ops` or `deploy-dev` run in progress or queued.

- `43859352493-worker-scale-stopped.log`: `worker-scale --to stopped`, 11:37:16 UTC. "worker-scale: the worker Machine is stopped" at 11:37:43.
- `43861061798-spike-time.log`: `spike-time`, dispatched at 11:49:10 UTC, as `dev`'s clock (no lead: its only earlier `dev-clock` run, 43155910874, made it 0 seconds ahead, and no run had moved it since) read 06:49 in New York. Its last lines: "spike-time: all 12 checks passed" (the Machine's half) and "spike-time: every check passed" (the runner's).
- `43861320798-worker-scale-started.log`: `worker-scale --to started`, 11:51:04 UTC. "worker-scale: the worker Machine is started" at 11:51:25.
- `zone_table.py`: prints the report's zone table from `packages/domain/src/time/civil.test.ts`' `ZONE_TABLE` (`python3 -I zone_table.py packages/domain/src/time/civil.test.ts`); `zone_table.md` is its output at `dedc8a7` (23 rows), the table in the report.

Each log is the job's whole log as GitHub gives it (`GET .../actions/jobs/<id>/logs`), with two changes: the Fly organization's slug is `<organization>`, and the runner's address in the WireGuard peer's name is `<runner>`. GitHub had already masked every secret as `***`. Checked after the change: no organization slug, email address, project reference, token or key.
