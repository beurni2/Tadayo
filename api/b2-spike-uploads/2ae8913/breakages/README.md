# PR #109, round 1's fixes: deliberate breakages

`api/b2-spike-uploads` at `2ae8913` (spike S1's first server PR, its round 1 commit). Each of round 1's fixes was broken
alone with `breakages.py`, on the tree this commit holds, before the commit: the file changed, the suite registered for
it run, and the file restored. A breakage of `db/migrations/0016_upload_reservation.sql` ran on a database made again
from the changed file, and the database was made again from the true file before the next. The tree's `git diff`
hashed the same before and after the run, and the commit changed only `docs/JOURNAL.md` and `docs/PROGRESS.md` beside
the code the run saw.

A breakage is caught when a test whose name holds the pre-registered words fails. All 18 were caught (`run.log`);
`out/<code>.patch` is the change alone and `out/<code>.txt` the suite's output.

| Code | Breakage | Suite | Failed |
|---|---|---|---|
| K01 | the domain lets a slot that holds an upload take another | `tests/src/db/uploads.test.ts` | 3 |
| K02 | the domain counts a rejected upload as holding the slot | same | 1 |
| M01 | 0016's guard reads the reservation without `FOR SHARE` | same, on a database made from it | 2 (both races) |
| M02 | no index keeps one upload per slot | same | 1 |
| M03 | the index counts a rejected upload | same | 2 |
| O01 | an upload is its owner's at its `expires_at` | `packages/domain/src/authorization/upload.test.ts` | 1 |
| O02 | an upload is anyone's | same | 1 |
| S01 | a token with upsert on is believed | `services/api/src/media/storage.test.ts` | 2 |
| S02 | a token for another object is believed | same | 2 |
| S03 | any 200 is an object there | same | 1 |
| R01 | the signed upload outlives its upload | `services/api/src/media/uploads.test.ts` | 1 |
| R02 | the signed upload drops `x-upsert` | same | 3 |
| P01 | the probe believes a token with upsert on | `tools/ops/src/supabase-probe.test.ts` | 1 |
| P02 | the probe takes any refusal of the second `PUT` | same | 1 |
| P03 | the probe doesn't read the bytes back after the second `PUT` | same | 1 |
| J01 | the judge lets a slot that holds an upload take another | `tests/src/privacy/upload.test.ts` | 1 |
| J02 | the judge answers a retry from the receipt whoever asks | same | 1 |
| C01 | the scanner lets a signed upload outlive its upload | `tests/src/privacy/scanner.test.ts` | 1 |

The tokens in the outputs are the probe's fake's, signed with no key. D3 (`markPreparing` locks `FOR NO KEY UPDATE`)
weakens a lock no test can tell from `FOR UPDATE`, so it has no breakage.
