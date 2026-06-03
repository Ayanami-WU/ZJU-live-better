# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
    && pnpm install --prod --frozen-lockfile \
    && pnpm store prune

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
COPY docker/entrypoint.sh /usr/local/bin/live-better-entrypoint

RUN chmod +x /usr/local/bin/live-better-entrypoint \
    && mkdir -p /data/downloads \
    && chown -R node:node /app /data

USER node

ENTRYPOINT ["live-better-entrypoint"]
CMD ["courses.zju/autosign.js"]
