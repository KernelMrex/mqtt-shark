# MQTT Shark

MQTT Shark is a small open source MQTT explorer. The MVP runs as a single Docker image with a Go backend and a lightweight static frontend.

## MVP

- Connect to MQTT brokers through `mqtt://`, `mqtts://`, `ws://`, or `wss://`.
- Subscribe and unsubscribe to topics.
- Publish messages with QoS and retain options.
- View incoming messages in the browser.
- Package frontend and backend into one Docker image.

## Stack

- Go backend: `net/http`, embedded static files, WebSocket bridge.
- MQTT client: Eclipse Paho MQTT.
- Frontend: plain HTML, CSS, and browser JavaScript with no build step.

## Run Locally

```bash
make run
```

Open http://localhost:8080.

## Build

```bash
make build
```

The version is embedded into the binary and exposed in the web UI through `/api/info`. Builds use the exact Git tag on `HEAD`; if `HEAD` is not tagged, they use the short commit hash.

## Run With Docker

```bash
make up
```

Open http://localhost:8080.

Stop the container with:

```bash
make down
```

## Security Note

Credentials are only kept in the active browser session and are sent to the local MQTT Shark backend to establish a broker connection. Do not expose MQTT Shark publicly without authentication, TLS, and network restrictions.
