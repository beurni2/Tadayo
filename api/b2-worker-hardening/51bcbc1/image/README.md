# api/b2-worker-hardening: the image started 16 ways, at the fifth commit (51bcbc1)

Built in the session from the fifth commit's tree (`git archive 51bcbc12 | docker build --build-arg
NODE_IMAGE=tadayo-node-ca:local -`: the pinned base with the session's CA added so pnpm could install; nothing else
differs from `NODE_IMAGE`), tagged `tadayo-api-dev:51bcbc1`, image id in `IMAGE-ID.txt`. Every TypeScript file under
`/app/services` and `/app/packages` in the image (203) is byte for byte the commit's (`ts-files-sha256.txt`, each
checked against `git show 51bcbc12:<file>`).

`image-runs.sh` starts it 16 ways with `docker run`, one output file each (`NN-*.txt`: the command, the output, the
exit status). No database or Supabase is given, so a start that passes the refusals stops at its first setting
(`DATABASE_URL isn't set`).

- Refused, exit 1, with the worker's refusal: as root alone with the image's settings (01), with
  `TADAYO_PHOTO_USER` emptied (02), with `NODE_ENV` emptied (03, by the marker), with both emptied (04), as `node`
  alone (05), as root with `NODE_ENV=development` (13), with `setpriv --euid=node` alone (14), and with `fly.toml`'s
  worker command short of `--no-new-privs` (15).
- Refused, exit 1, with the API's refusal: as root (06) and as root with `NODE_ENV=development` (12).
- Past the refusals: the API as `node` (07), the image's bare `CMD` (08), `fly.toml`'s API command (09) and its
  worker command (10).
- 11: under `fly.toml`'s worker command, a real 4032 x 3024 JPEG made in the run (`real.mjs`) prepared by the real child
  as the image's photo user: real uid 0, effective 1000 and group 1000; the child as uid and gid 10001; both
  renditions made.
- 16: what the image holds: the marker, `NODE_ENV=production`, `TADAYO_PHOTO_USER=tadayo-image`, and the user
  `tadayo-image` (uid 10001).

The same 16 starts in the image built from the working tree before the commit gave the same outputs (the photo's peak
memory aside).
