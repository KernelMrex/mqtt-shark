APP_NAME := mqtt-shark
override APP_VERSION := $(shell git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo dev)
PORT ?= 8080
CONTAINER_NAME ?= $(APP_NAME)
CGO_ENABLED ?= 1

GO ?= go
NPM ?= npm
DOCKER ?= docker
DOCKER_IMAGE ?= $(APP_NAME):$(APP_VERSION)
DOCKER_PLATFORM ?= linux/$(shell $(GO) env GOARCH)
DOCKER_BUILD_OUTPUT ?= --load
DEV_BROKER_CONTAINER_NAME ?= $(APP_NAME)-dev-broker
DEV_BROKER_PORT ?= 1883

LDFLAGS := -s -w -X main.AppVersion=$(APP_VERSION)

.PHONY: help frontend-deps frontend-build frontend-dev dev-broker run build test check docker-build up down logs clean

help:
	@echo "Targets:"
	@echo "  make run           Run app locally"
	@echo "  make build         Build local binary"
	@echo "  make frontend-dev  Run Vite dev server"
	@echo "  make dev-broker    Run a local MQTT broker for manual testing"
	@echo "  make test          Run Go tests"
	@echo "  make check         Build frontend and run Go tests"
	@echo "  make docker-build  Build Docker image"
	@echo "  make up            Build and run Docker container"
	@echo "  make down          Stop Docker container"
	@echo "  make logs          Tail Docker container logs"
	@echo "  make clean         Remove local build output"
	@echo "Version: $(APP_VERSION)"

frontend-deps:
	$(NPM) install --prefix web

frontend-build: frontend-deps
	$(NPM) run build --prefix web

frontend-dev: frontend-deps
	$(NPM) run dev --prefix web

dev-broker:
	@echo "Starting MQTT broker at mqtt://localhost:$(DEV_BROKER_PORT)"
	@echo "Press Ctrl+C to stop it."
	$(DOCKER) run --rm -it --name $(DEV_BROKER_CONTAINER_NAME) -p $(DEV_BROKER_PORT):1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf

run: frontend-build
	$(GO) -C backend run -ldflags "$(LDFLAGS)" ./cmd/$(APP_NAME)

build: frontend-build
	CGO_ENABLED=$(CGO_ENABLED) $(GO) -C backend build -trimpath -ldflags "$(LDFLAGS)" -o ../bin/$(APP_NAME) ./cmd/$(APP_NAME)

test: frontend-build
	$(GO) -C backend test ./...

check: test

docker-build:
	$(DOCKER) buildx build \
		--platform $(DOCKER_PLATFORM) \
		$(DOCKER_BUILD_OUTPUT) \
		--build-arg APP_VERSION=$(APP_VERSION) \
		-t $(DOCKER_IMAGE) \
		.

up: docker-build
	@$(DOCKER) rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
	$(DOCKER) run -d --name $(CONTAINER_NAME) -p $(PORT):8080 $(DOCKER_IMAGE)
	@echo "MQTT Shark is running at http://localhost:$(PORT)"

down:
	@$(DOCKER) rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true

logs:
	$(DOCKER) logs -f $(CONTAINER_NAME)

clean:
	rm -rf ./bin ./backend/web/dist
