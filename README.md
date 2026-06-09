# MQTT Shark

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Docker image](https://img.shields.io/badge/docker-ghcr.io%2Fkernelmrex%2Fmqtt--shark-blue.svg)](https://github.com/KernelMrex/mqtt-shark/pkgs/container/mqtt-shark)

MQTT Shark is a lightweight web MQTT explorer for debugging broker traffic from your browser. It helps you connect to a broker, discover live topics, inspect incoming messages, and understand payloads without installing a desktop client.

It ships as a single Docker image with a Go backend, a React frontend, and an embedded production build, so the same artifact can run locally, in a lab, or next to your MQTT infrastructure.

## Demo

|  |  |  |
| :---: | :---: | :---: |
| [<img src="docs/img/screenshot-1.png" alt="MQTT Shark broker connection screen" width="320">](docs/img/screenshot-1.png) | [<img src="docs/img/screenshot-2.png" alt="MQTT Shark broker content explorer" width="320">](docs/img/screenshot-2.png) | [<img src="docs/img/screenshot-3.png" alt="MQTT Shark send message interface" width="320">](docs/img/screenshot-3.png) |
| Broker connection | Broker content explorer | Send message to a topic |

## Why MQTT Shark

- Fast broker inspection when you need to see what is actually moving through MQTT.
- Topic discovery through `#`, shown as a navigable topic tree instead of a flat stream.
- Message history with QoS, retain flag, timestamps, topic filters, selected-message pinning, and optional auto-rotation to the newest message.
- Payload viewer with auto detection and explicit `Text`, `JSON`, `XML`, `Binary`, and `Base64` modes.
- Publishing from the web UI for quick broker probes and manual test messages.
- Simple deployment: one HTTP service, one Docker image, no separate frontend hosting.

## Core Workflows

Connect to a broker, start discovery, and choose a topic from the left panel to focus the message history. The right panel keeps the latest messages for the active topic, with payload previews constrained to the sidebar so long messages do not break the layout.

Click any message to inspect its payload in the center panel. The selected message stays pinned above the right-hand history, so it remains visible even when newer messages arrive or when it falls outside the latest in-memory window.

Use `Auto Rotate` in the right panel when you want MQTT Shark to keep selecting the newest message for the active topic. Turn it off when you need to hold the current payload while traffic continues.

Use `Send` in the right panel to publish a manual message. MQTT Shark suggests the currently selected topic when it can, while still allowing any explicit topic, QoS, payload, and retain flag.

## Quick Start

Run the published image:

```bash
docker run --rm -p 8080:8080 ghcr.io/kernelmrex/mqtt-shark:latest
```

Open http://localhost:8080 and connect to your broker.

Optionally prefill the broker host field from the runtime environment:

```bash
docker run --rm -p 8080:8080 \
  -e MQTT_SHARK_BROKER_HOST=192.168.1.10 \
  ghcr.io/kernelmrex/mqtt-shark:latest
```

Or build and run the local Docker image:

```bash
make up
```

Stop the container with:

```bash
make down
```

## Local Development

Run the full app locally:

```bash
make run
```

For frontend-only development, keep the Go backend running with `make run`, then start Vite:

```bash
make frontend-dev
```

The app is served from http://localhost:8080. The Vite dev server proxies API traffic to the Go backend.

Start a disposable MQTT broker for manual testing:

```bash
make dev-broker
```

Connect MQTT Shark to `mqtt://localhost:1883`. Stop the broker with `Ctrl+C`.
To use another host port, run:

```bash
make dev-broker DEV_BROKER_PORT=1884
```

## Build and Test

Build the local binary:

```bash
make build
```

Run checks:

```bash
make check
```

The frontend is built first, then embedded into the Go binary. The app version is exposed in the web UI through `/api/info`; tagged builds use the exact Git tag on `HEAD`, while untagged builds use the short commit hash.

## Architecture

- Backend: Go `net/http`, embedded static files, and a WebSocket bridge.
- MQTT client: Eclipse Paho MQTT.
- Frontend: React and Vite.
- Packaging: Docker Buildx multi-architecture images for `linux/amd64` and `linux/arm64`.

## Compatibility Note

Versions before `v1.0.0` do not guarantee backward compatibility between the frontend and backend.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned work. The near-term direction is practical MQTT exploration: saved broker profiles, stronger tests around session behavior, and safer exposed deployments.

## Security Note

MQTT Shark is designed as an operator/debugging tool. Do not expose it publicly without authentication, TLS, and network restrictions.

## License

MQTT Shark is released under the [MIT License](LICENSE).
