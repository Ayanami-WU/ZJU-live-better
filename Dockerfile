ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
    && pnpm install --prod --frozen-lockfile \
    && pnpm store prune

FROM ${NODE_IMAGE} AS runtime

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
