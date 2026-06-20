# check=skip=SecretsUsedInArgOrEnv

ARG NDX2_RUNTIME_BASE_IMAGE=ghcr.io/hikamaeng/ndx2-runtime-base:0.2.3

FROM ${NDX2_RUNTIME_BASE_IMAGE}

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
