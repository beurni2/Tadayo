# Local, evidence-only: the repository's pinned Node base plus the session proxy's CA, so that a build
# inside this session can reach the npm registry through the egress gateway (never part of the repository).
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc
COPY ca-bundle.crt /usr/local/share/session-ca-bundle.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/session-ca-bundle.crt
