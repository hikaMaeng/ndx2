FROM node:22-alpine

WORKDIR /app

COPY apps/admin/dist ./dist

ENV NODE_ENV=production
ENV PORT=18080

EXPOSE 18080

CMD ["node", "dist/server/index.js"]
