# MQTT Shark

MQTT Shark is a small open source MQTT explorer. The MVP runs as a single Docker image with a Go backend and a React frontend.

See [ROADMAP.md](ROADMAP.md) for planned work.

## MVP

- Connect to MQTT brokers through `mqtt://`, `mqtts://`, `ws://`, or `wss://`.
- Subscribe and unsubscribe to topics.
- Publish messages with QoS and retain options.
- View incoming messages in the browser.
- Package frontend and backend into one Docker image.

## Stack

- Go backend: `net/http`, embedded static files, WebSocket bridge.
- MQTT client: Eclipse Paho MQTT.
- Frontend: React and Vite. The production build is written to `backend/web/dist` and embedded into the Go binary.
- Docker builds: Buildx with Zig cc for CGO-ready Linux binaries.

## Run Locally

```bash
make run
```

Open http://localhost:8080.

For frontend-only development, run the Go backend with `make run` and the Vite dev server with:

```bash
make frontend-dev
```

## Build

```bash
make build
```

The frontend is built first, then embedded into the Go binary. The version is exposed in the web UI through `/api/info`. Builds use the exact Git tag on `HEAD`; if `HEAD` is not tagged, they use the short commit hash.

## Run With Docker

```bash
make up
```

Open http://localhost:8080.

Stop the container with:

```bash
make down
```

## Container Image

Pushes to `main` and version tags like `v1.2.3` publish a multi-architecture Docker image to GitHub Container Registry:

```bash
docker pull ghcr.io/kernelmrex/mqtt-shark:latest
```

## Security Note

Credentials are only kept in the active browser session and are sent to the local MQTT Shark backend to establish a broker connection. Do not expose MQTT Shark publicly without authentication, TLS, and network restrictions.
