# marketplace-example project — common dev/prod operations
# Usage: make <target>

ifneq (,$(wildcard .env))
  include .env
  export
endif

COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f docker-compose.dev.yml
PROJECT_DEV  := marketplace-example-dev
PROJECT_PROD := marketplace-example

.PHONY: help
help:
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## --- Dev ---
.PHONY: dev dev-build dev-down dev-logs dev-restart
dev: ## Start dev stack (vite + nest watch + postgres)
	$(COMPOSE_DEV) up -d --build
	@echo "Frontend: http://localhost:$(or $(FRONTEND_HOST_PORT),5173)"
	@echo "Backend:  http://localhost:$(or $(BACKEND_HOST_PORT),3000)/api"
	@echo "Debug:    localhost:$(or $(BACKEND_DEBUG_HOST_PORT),9229)"
	@echo "Postgres: localhost:$(or $(DB_HOST_PORT),5432) (use DBeaver)"

dev-build: ## Rebuild dev images
	$(COMPOSE_DEV) build

dev-down: ## Stop dev stack
	$(COMPOSE_DEV) down

dev-logs: ## Tail dev logs
	$(COMPOSE_DEV) logs -f

dev-restart: ## Restart dev backend
	$(COMPOSE_DEV) restart backend

## --- Prod ---
.PHONY: build up down logs restart
build: ## Build prod images
	$(COMPOSE) build

up: ## Start prod stack
	$(COMPOSE) up -d
	@echo "App:     http://localhost:$(or $(FRONTEND_PORT),8080)"
	@echo "Adminer: http://localhost:$(or $(ADMINER_PORT),8081)"

down: ## Stop prod stack
	$(COMPOSE) down

logs: ## Tail prod logs
	$(COMPOSE) logs -f

restart: ## Restart prod backend
	$(COMPOSE) restart backend

## --- Database ---
.PHONY: psql db-reset
psql: ## Open psql in the running postgres container (dev)
	$(COMPOSE_DEV) exec postgres psql -U $${DB_USERNAME:-postgres} -d $${DB_NAME:-marketplace-example}

db-reset: ## Drop dev DB volume and recreate
	$(COMPOSE_DEV) down -v
	$(COMPOSE_DEV) up -d postgres

## --- Local (no docker) ---
.PHONY: install backend-dev frontend-dev
install: ## Install deps locally
	cd backend && pnpm install
	cd frontend && pnpm install

backend-dev: ## Run backend locally (needs local postgres or `make dev` postgres only)
	cd backend && pnpm run start:dev

frontend-dev: ## Run frontend locally
	cd frontend && pnpm run dev

## --- QA ---
.PHONY: test lint clean
test: ## Run all tests
	cd backend && pnpm run test
	cd frontend && pnpm run lint

lint: ## Lint everything
	cd backend && pnpm run lint
	cd frontend && pnpm run lint

clean: ## Tear down everything + prune volumes
	$(COMPOSE) down -v --remove-orphans
	$(COMPOSE_DEV) down -v --remove-orphans
