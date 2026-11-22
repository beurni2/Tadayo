# Round 2's deliberate breakages, PR #109 (`api/b2-spike-uploads`, `eafd8d5`)

Eight breakages of round 2's fixes, each one change alone, run by `breakages.py` on the tree the commit `eafd8d5` holds, before it was committed, with the file restored after each. The tree's `git diff` hashed the same before and after the run. `run.log` is the run; `out/<code>.patch` is each change and `out/<code>.txt` its suite's output.

| Code | The breakage | Suite | Caught by |
|---|---|---|---|
| S04 | Storage's Duplicate on signing read as Storage unavailable | `services/api` storage.test.ts | `reads Storage's Duplicate, the object already there, as no URL to give, and no other 409 or refusal as it` |
| S05 | A 409 in a 200's body read as the bytes in | same | same |
| F01 | The fake Storage signs for an object it holds | `services/api` uploads.test.ts | `answers a replay once the bytes are in as the receipt does, with no URL, since Storage signs nothing for them (T12)` |
| R03 | The route answers a replay with the bytes in 503 | same | same |
| J03 | The judge wants a URL while the upload is pending, whatever its bytes | `tests` privacy/upload.test.ts | `answers the stored answer alone, with no URL, once the upload's bytes are in, pending though it is` |
| L01 | The preparation locks the upload `FOR UPDATE` | `tests` db/uploads.test.ts | `keeps no row that names the upload waiting while it is handed to preparation: its lock is FOR NO KEY UPDATE` (55P03 after its 5 s `lock_timeout`) |
| P04 | The probe takes any refusal of the second signing | `tools/ops` supabase-probe.test.ts | `names the second signing's control when Storage signs again for the object that is there, or refuses it otherwise than its 409` |
| P05 | The probe takes a 409 in a 200's body as the second signing refused | same | same |

Each failed exactly one test, the one named. Round 1's 18 are under `../../2ae8913/breakages/`.
