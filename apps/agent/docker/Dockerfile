FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache bash coreutils findutils grep gawk perl git docker-cli docker-cli-compose

COPY apps/agent/dist ./dist
COPY apps/agent/assets ./assets
COPY apps/agent/package.json ./package.json
COPY packages/ndx/src/agent/server/tool/basetools ./dist/server/basetools

VOLUME ["/ndx"]

ENV NODE_ENV=production
ENV PORT=18080
ENV NDX_ROOT=F:/dev/ndx2/volume

EXPOSE 18080

CMD ["node", "dist/server/index.js"]
