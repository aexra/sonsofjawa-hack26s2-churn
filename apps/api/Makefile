GRADLE := ./gradlew

.PHONY: build test lint format format-check verify run clean

build:
	$(GRADLE) build

test:
	$(GRADLE) test

lint:
	$(GRADLE) spotlessCheck

format:
	$(GRADLE) spotlessApply

format-check:
	$(GRADLE) spotlessCheck

verify:
	$(GRADLE) spotlessCheck build

run:
	$(GRADLE) bootRun

clean:
	$(GRADLE) clean
