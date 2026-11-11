# The image of the API and the worker: one image, two process groups, started by the commands in
# fly.toml's [processes] (docs/plans/api-b0-deploy.md, section 1; TECH-DESIGN sections 1, 3 and 7;
# ADR-003). Node 26 runs the TypeScript as it is (type stripping), so there is no build step: the
# image is the production dependencies and the source.
#
# The base is a tag for the reader and a digest for the build. It is bumped by hand, in a pull
# request of its own, when Node's patch moves; its major is .nvmrc's. The pnpm version is the root
# package.json's `packageManager`. Both are checked by tools/ops/src/deploy-files.test.ts. There is no
# `# syntax=` line: it would pull a floating frontend image at every build, and nothing here needs one.
ARG NODE_IMAGE=node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072

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
# The manifests and node_modules as pnpm laid them: its symlinks are what makes a workspace import resolve.
COPY --from=deps /app/ ./
COPY packages/contracts/src packages/contracts/src
COPY packages/domain/src packages/domain/src
COPY services/api/src services/api/src
COPY services/worker/src services/worker/src
COPY tools/ops/src tools/ops/src
USER node
# fly.toml's [processes] give each group its command in place of this one; run bare, the image starts the API.
CMD ["node", "services/api/src/main.ts"]
