UV := uv

.PHONY: install lint typecheck test format verify run

install:
	$(UV) sync

lint:
	$(UV) run ruff check .
	$(UV) run ruff format --check .

typecheck:
	$(UV) run mypy

test:
	$(UV) run pytest

format:
	$(UV) run ruff check --fix .
	$(UV) run ruff format .

verify: install lint typecheck test

run:
	$(UV) run python -m churn_mcp
