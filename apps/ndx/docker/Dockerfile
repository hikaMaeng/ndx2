ARG NDX2_PGVECTOR_TAG=0.2.0
ARG YARN_VERSION=4.9.2

FROM node:22-bookworm-slim AS node-runtime

FROM ghcr.io/hikamaeng/ndx2-pgvector:${NDX2_PGVECTOR_TAG}

ARG YARN_VERSION=4.9.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils findutils grep gawk perl git \
    chromium fonts-noto-cjk fonts-noto-color-emoji \
    docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin /usr/local/bin
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && corepack enable \
    && corepack prepare yarn@${YARN_VERSION} --activate \
    && yarn --version

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV NODE_PATH=/usr/local/lib/node_modules
ENV NDX_HEADLESS_BROWSER_EXECUTABLE=/usr/bin/chromium
RUN npm install -g playwright@1 @playwright/test@1 \
    && npm cache clean --force \
    && node -e "require('playwright'); require('@playwright/test')" \
    && playwright --version \
    && /usr/bin/chromium --version

WORKDIR /app

COPY apps/ndx/dist ./dist
COPY apps/ndx/assets ./assets
COPY apps/ndx/package.json ./package.json
COPY packages/ndx/src/agent/tool/base ./dist/server/base
COPY packages/ndx/src/agent/init/assets ./dist/server/assets
COPY apps/ndx/docker/entrypoint.sh /usr/local/bin/ndx2-entrypoint

RUN chmod +x /usr/local/bin/ndx2-entrypoint

VOLUME ["/ndx"]

ENV NODE_ENV=production
ENV PORT=18080
ENV NDX_ROOT=/ndx
ENV POSTGRES_USER=ndev
ENV POSTGRES_PASSWORD=ndev
ENV POSTGRES_DB=ndev
ENV PGDATA=/ndx/pgvector/pgdata
ENV NDX_DATABASE_URL=postgresql://ndev:ndev@127.0.0.1:5432/ndev

EXPOSE 18080

ENTRYPOINT ["ndx2-entrypoint"]
