ARG PLAYWRIGHT_VERSION=1
ARG YARN_VERSION=4.9.2

FROM node:22-bookworm-slim

ARG PLAYWRIGHT_VERSION=1
ARG YARN_VERSION=4.9.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates coreutils curl file findutils gawk git grep gzip \
    iproute2 jq less make netcat-openbsd openssh-client perl procps python3 \
    rsync sed tar unzip zip \
    chromium fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

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

COPY apps/__SERVICE_NAME__/dist ./dist

ENV NODE_ENV=production
ENV PORT=18080

EXPOSE 18080

CMD ["node", "dist/server/index.js"]
