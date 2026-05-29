APP_NAME := mqtt-shark
override APP_VERSION := $(shell git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo dev)
PORT ?= 8080
CONTAINER_NAME ?= $(APP_NAME)
CGO_ENABLED ?= 1

GO ?= go
DOCKER ?= docker
DOCKER_IMAGE ?= $(APP_NAME):$(APP_VERSION)
DOCKER_PLATFORM ?= linux/$(shell $(GO) env GOARCH)
DOCKER_BUILD_OUTPUT ?= --load

LDFLAGS := -s -w -X main.AppVersion=$(APP_VERSION)

.PHONY: help run build test check docker-build up down logs clean

help:
	@echo "Targets:"
	@echo "  make run           Run app locally"
	@echo "  make build         Build local binary"
	@echo "  make test          Run Go tests"
	@echo "  make check         Run tests and JS syntax check"
	@echo "  make docker-build  Build Docker image"
	@echo "  make up            Build and run Docker container"
	@echo "  make down          Stop Docker container"
	@echo "  make logs          Tail Docker container logs"
	@echo "  make clean         Remove local build output"
	@echo "Version: $(APP_VERSION)"

run:
	$(GO) run -ldflags "$(LDFLAGS)" ./cmd/$(APP_NAME)

build:
	CGO_ENABLED=$(CGO_ENABLED) $(GO) build -trimpath -ldflags "$(LDFLAGS)" -o ./bin/$(APP_NAME) ./cmd/$(APP_NAME)

test:
	$(GO) test ./...

check: test
	node --check web/static/app.js

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
	rm -rf ./bin
