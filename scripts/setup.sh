#!/usr/bin/env bash
set -euo pipefail

echo "== Postly setup =="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in API keys before going to production."
fi

echo "Installing dependencies..."
npm install --workspaces --include-workspace-root

echo "Building packages..."
npm run build

echo "Starting Postgres + Redis via Docker..."
docker compose -f docker/docker-compose.yml up -d postgres redis

echo "Waiting for Postgres to be healthy..."
until docker compose -f docker/docker-compose.yml exec -T postgres pg_isready -U postly >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
node apps/api/dist/db/migrate.js

echo
echo "Setup complete. Start services with:"
echo "  npm run dev:api"
echo "  npm run dev:workers"
echo "  npm run dev:frontend"
echo
echo "...or run everything in Docker with: make docker-up"
