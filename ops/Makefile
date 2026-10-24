ENV_FILE := ../.env
ENV_BUILD_FILE := ../.env.build
COMPOSE := docker compose -f compose/compose.yml --env-file $(ENV_FILE)
COMPOSE_DEV := docker compose -f compose/compose.yml -f compose/compose.dev.yml --env-file $(ENV_FILE)
COMPOSE_BUILD := docker compose -f compose/compose.yml --env-file $(ENV_BUILD_FILE)

.PHONY: check-env check-env-build up down restart logs ps dev db-reset seed build-images push

check-env:
	@test -f $(ENV_FILE) || { echo "файл .env не найден: скопируйте .env.example в .env"; exit 1; }

check-env-build:
	@test -f $(ENV_BUILD_FILE) || { echo "файл .env.build не найден: скопируйте .env.build.example в .env.build"; exit 1; }

up: check-env
	$(COMPOSE) up -d --build --wait pg api web
	$(COMPOSE) run --rm seed

down: check-env
	$(COMPOSE) down

restart: check-env
	$(COMPOSE) restart

logs: check-env
	$(COMPOSE) logs -f

ps: check-env
	$(COMPOSE) ps -a

dev: check-env
	$(COMPOSE_DEV) up -d --wait pg

db-reset: check-env
	$(COMPOSE) down -v
	$(MAKE) up

seed: check-env
	$(COMPOSE) run --rm seed

build-images: check-env-build
	$(COMPOSE_BUILD) build api web

push: build-images
	$(COMPOSE_BUILD) push api web
