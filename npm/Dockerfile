# check=skip=SecretsUsedInArgOrEnv

ARG PLAYWRIGHT_VERSION=1
ARG YARN_VERSION=4.9.2

FROM node:22-bookworm-slim AS node-runtime

FROM pgvector/pgvector:pg17

ARG PLAYWRIGHT_VERSION
ARG YARN_VERSION

# npm release builds one final image directly; it does not consume local file images.
# See docs/npm-release.md#npm-single-image-contract.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl make g++ patch git \
    automake autoconf libtool \
    postgresql-server-dev-17 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LO https://bitbucket.org/eunjeon/mecab-ko/downloads/mecab-0.996-ko-0.9.2.tar.gz \
    && tar zxf mecab-0.996-ko-0.9.2.tar.gz \
    && cd mecab-0.996-ko-0.9.2 \
    && cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && ./configure && make && make install \
    && ldconfig

RUN curl -LO https://bitbucket.org/eunjeon/mecab-ko-dic/downloads/mecab-ko-dic-2.1.1-20180720.tar.gz \
    && tar zxf mecab-ko-dic-2.1.1-20180720.tar.gz \
    && cd mecab-ko-dic-2.1.1-20180720 \
    && ./autogen.sh && cp /usr/share/misc/config.guess /usr/share/misc/config.sub . \
    && find . -exec touch {} + && ./configure && make && make install \
    && echo "dicdir = /usr/local/lib/mecab/dic/mecab-ko-dic" > /usr/local/etc/mecabrc

RUN git clone --depth 1 https://github.com/i0seph/textsearch_ko.git \
    && cd textsearch_ko \
    && make USE_PGXS=1 \
    && make USE_PGXS=1 install \
    && cd .. && rm -rf textsearch_ko

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    bash coreutils curl file findutils gawk git gnupg grep gzip \
    iproute2 jq less make netcat-openbsd openssh-client perl procps \
    python3 rsync sed tar unzip zip \
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

RUN npm install -g playwright@${PLAYWRIGHT_VERSION} @playwright/test@${PLAYWRIGHT_VERSION} \
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
