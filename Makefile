MAKEFLAGS += --no-print-directory

.DEFAULT_GOAL := help

.PHONY: help up down restart logs ps dev db-reset seed demo-data demo-data-test build-images push build test lint format verify e2e openapi-lint

help: ## list targets
	@grep -E '^[a-zA-Z0-9_%-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "%-16s %s\n", $$1, $$2}'

up: ## start the stack
	@$(MAKE) -C ops $@

down: ## stop the stack
	@$(MAKE) -C ops $@

restart: ## restart the stack
	@$(MAKE) -C ops $@

logs: ## follow stack logs
	@$(MAKE) -C ops $@

ps: ## list stack containers
	@$(MAKE) -C ops $@

dev: ## start the local database for development
	@$(MAKE) -C ops $@

db-reset: ## drop the database volume and start again
	@$(MAKE) -C ops $@

seed: ## load seed data into the running stack
	@$(MAKE) -C ops $@

demo-data: ## regenerate the demo dataset
	@$(MAKE) -C ops $@

demo-data-test: ## test the demo dataset generator
	@$(MAKE) -C ops $@

build-images: ## build api and web images
	@$(MAKE) -C ops $@

push: ## build and push images to the registry
	@$(MAKE) -C ops $@

build: api-build web-build ## build api and web

test: api-test web-test ## run api and web tests

lint: api-lint web-lint openapi-lint ## run all linters

format: api-format web-format ## format api and web sources

verify: api-verify web-verify openapi-lint demo-data-test ## run every check before merge

e2e: ## run end-to-end tests against the stack
	@if [ -d apps/web ]; then $(MAKE) -C apps/web e2e; else echo "apps/web: not created yet"; fi

openapi-lint: ## lint the api contract
	@if [ -f openapi.yaml ]; then npx --yes @redocly/cli@1 lint openapi.yaml; else echo "openapi.yaml: not created yet"; fi

api-%: ## run a target of apps/api (api-<target>)
	@if [ -d apps/api ]; then $(MAKE) -C apps/api $*; else echo "apps/api: not created yet"; fi

web-%: ## run a target of apps/web (web-<target>)
	@if [ -d apps/web ]; then $(MAKE) -C apps/web $*; else echo "apps/web: not created yet"; fi
