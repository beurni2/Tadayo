# The image of the API and the worker: one image, two process groups, started by the commands in
# fly.toml's [processes] (docs/plans/api-b0-deploy.md, section 1; TECH-DESIGN sections 1, 3 and 7;
# ADR-003). Node 26 runs the TypeScript as it is (type stripping), so there is no build step: the
# image is the production dependencies and the source.
#
# The base is a tag for the reader and a digest for the build, and the two are changed together (the
# build uses the digest). It is bumped by hand, in a pull request of its own, when Node's patch moves;
# its major is .nvmrc's. 26.13.1 is the security release of 10 November 2026. The pnpm version is the root
# package.json's `packageManager`. Both are checked by tools/ops/src/deploy-files.test.ts. There is no
# `# syntax=` line: it would pull a floating frontend image at every build, and nothing here needs one.
#
# The image starts as root only to drop (docs/plans/api-b2-worker-hardening.md section 2; ADR-038): it has no
# `USER`, and each process group's command in fly.toml begins with `setpriv` (the worker's after `prlimit`, which
# sets its limits as root), which turns the API to `node` before any Node code runs and takes everything from the
# worker but root's ids, whose effective ones its first module turns to `node`'s (services/worker/src/turn.ts; Fly's
# kernel undoes an effective id `setpriv` sets under no new privileges). The API keeps no way back. The worker keeps root as its real user, which makes it non-dumpable,
# and starts each photo's process as `tadayo-image`, a user with no home, no shell and no password, so code that took
# over a decoder runs as neither the worker's user nor root (services/worker/src/privileges.ts). A start that skips
# the drop fails closed (the audit's A6): the image names its photo user here, beside the user it makes, so the worker
# started as root alone refuses for that alone; and in the image (NODE_ENV=production, or the marker it writes, which
# no setting can take away) the API refuses any start as root and the worker any start but fly.toml's
# (services/api/src/start.ts, services/worker/src/privileges.ts).
ARG NODE_IMAGE=node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Node 26 ships no corepack, so pnpm comes from npm, at the version the repository pins.
RUN npm install --global pnpm@12.16.1
# pnpm reads every workspace package's manifest before it installs any of them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY tests/package.json tests/
COPY tools/ops/package.json tools/ops/
# Only what the API, the worker and the ops scripts need to run: no dev tools, no Prism, no tests.
RUN pnpm install --frozen-lockfile --prod \
    --filter "@tadayo/api..." --filter "@tadayo/worker..." --filter "@tadayo/ops..."

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 tadayo-image \
    && useradd --system --uid 10001 --gid tadayo-image --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin tadayo-image
ENV TADAYO_PHOTO_USER=tadayo-image
# The image's marker: with it, each entry knows it is in the image whatever NODE_ENV says, and refuses root as above.
RUN touch /etc/tadayo-built-image
# The manifests and node_modules as pnpm laid them: its symlinks are what makes a workspace import resolve.
COPY --from=deps /app/ ./
COPY packages/contracts/src packages/contracts/src
COPY packages/domain/src packages/domain/src
COPY services/api/src services/api/src
COPY services/worker/src services/worker/src
COPY tools/ops/src tools/ops/src
# fly.toml's [processes] give each group its command in place of this one; run bare, the image starts the API, as
# fly.toml's `api` does.
CMD ["setpriv", "--reuid=node", "--regid=node", "--init-groups", "--inh-caps=-all", "--bounding-set=-all", "--no-new-privs", "--", "node", "--disable-sigusr1", "services/api/src/main.ts"]
