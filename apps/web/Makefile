NPM := npm

.PHONY: install dev build test lint typecheck knip format format-check check-text gen-api api-drift verify e2e clean

install:
	$(NPM) ci

dev:
	$(NPM) run dev

build:
	$(NPM) run build

test:
	$(NPM) run test

lint:
	$(NPM) run lint

typecheck:
	$(NPM) run typecheck

knip:
	$(NPM) run knip

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check

check-text:
	$(NPM) run check:text

gen-api:
	$(NPM) run gen:api

api-drift:
	$(NPM) run api:drift

verify:
	$(NPM) run verify

e2e:
	@echo "e2e: not configured yet"

clean:
	rm -rf dist coverage
