# Sample contact sheets, PR #10 (`ios/b0-ios-workflow` at `f544332`)

Drawn by hand in the session with `python3 tools/ci/ios_steps.py sheets` at `f544332`, on a scratch copy of the repository, so the founder can see what the `ios` workflow's sheets look like before its first run. Not a workflow run.

- [F02-upcoming.jpg](F02-upcoming.jpg): a changed snapshot. Left, 2.1's render (`design/reference/2.1/F02-upcoming.png`); middle, the committed reference; right, this run's snapshot.
- [A02-email.jpg](A02-email.jpg): a new snapshot of a state with no render yet, shown alone and marked "built from spec, awaiting render".

The two snapshots and the reference are plain-colour stand-ins, not the app. The run line under each snapshot ("iOS 26.5 · iPhone 17", "ios/b0-ios-check @ 0123456") is sample data.

The workflow's own evidence goes to `<branch>/<short-sha>/ios/` (`ios-full/` for a run by hand's full set, `ios-<version>/` for a run on an older iOS), with an `index.md` that links every file.
