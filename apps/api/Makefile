GRADLE := ./gradlew
PYTHON ?= python3

.PHONY: build test ml-test lint format format-check verify run clean

build:
	$(GRADLE) build

test: ml-test
	$(GRADLE) test

ml-test:
	PYTHONDONTWRITEBYTECODE=1 $(PYTHON) -m unittest discover -s src/test/ml -p 'test_*.py' -v

lint:
	$(GRADLE) spotlessCheck

format:
	$(GRADLE) spotlessApply

format-check:
	$(GRADLE) spotlessCheck

verify: ml-test
	$(GRADLE) spotlessCheck build

run:
	$(GRADLE) bootRun

clean:
	$(GRADLE) clean
