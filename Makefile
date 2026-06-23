# Atalhos para o dia a dia. Use `make help` para a lista.

REPLICAS ?= 1
BASE_URL ?= http://localhost:8080

.PHONY: help up down scale logs ps smoke stress

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Sobe o stack (REPLICAS=N para escalar)
	docker compose up -d --scale wordpress=$(REPLICAS)

down: ## Derruba o stack (mantém os volumes)
	docker compose down

scale: ## Reescala as réplicas de WordPress (REPLICAS=N)
	docker compose up -d --scale wordpress=$(REPLICAS)

logs: ## Acompanha os logs
	docker compose logs -f

ps: ## Lista os containers do stack
	docker compose ps

smoke: ## Teste rápido de fumaça com k6
	BASE_URL=$(BASE_URL) k6 run loadtest/smoke.js

stress: ## Teste de estresse com k6
	BASE_URL=$(BASE_URL) k6 run loadtest/stress.js
