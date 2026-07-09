.PHONY: install dev-api dev-workers dev-frontend migrate typecheck test docker-up docker-down docker-prod clean

install:
	npm install --workspaces --include-workspace-root

dev-api:
	npm run dev:api

dev-workers:
	npm run dev:workers

dev-frontend:
	npm run dev:frontend

migrate:
	npm run migrate

typecheck:
	npm run typecheck

test:
	npm run test

docker-up:
	docker compose -f docker/docker-compose.yml up --build

docker-down:
	docker compose -f docker/docker-compose.yml down -v

docker-prod:
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/frontend/.next
