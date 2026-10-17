# Build from the repository root:  docker build -f apps/api/Dockerfile -t lims-api .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @lims/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npx --workspace @lims/api prisma generate && npm run build -w @lims/api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Apply pending migrations (non-destructive `migrate deploy`), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
