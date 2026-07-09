# syntax=docker/dockerfile:1
# Builds a runtime image that runs TypeScript directly via tsx.
# This sidesteps cross-package `tsc` project-reference wiring for a
# monorepo of this size — see docs/ARCHITECTURE.md for the tradeoff.
FROM node:18-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.json ./

RUN npm install --workspaces --include-workspace-root --omit=dev=false

ARG SERVICE=api
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production

EXPOSE 4000
CMD ["sh", "-c", "npm run start --workspace=apps/${SERVICE}"]
