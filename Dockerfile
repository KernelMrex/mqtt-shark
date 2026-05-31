# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend

WORKDIR /src/web

COPY web/package*.json ./
RUN npm ci

COPY web ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build

ARG BUILDARCH
ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT
ARG APP_VERSION=dev
ARG ZIG_VERSION=0.13.0

RUN apk add --no-cache ca-certificates curl tar xz

RUN set -eux; \
    case "${BUILDARCH}" in \
      amd64) zig_arch="x86_64" ;; \
      arm64) zig_arch="aarch64" ;; \
      *) echo "unsupported build arch: ${BUILDARCH}" >&2; exit 1 ;; \
    esac; \
    mkdir -p /usr/local/zig; \
    curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-linux-${zig_arch}-${ZIG_VERSION}.tar.xz" \
      | tar -xJ --strip-components=1 -C /usr/local/zig; \
    ln -s /usr/local/zig/zig /usr/local/bin/zig

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY backend ./
COPY --from=frontend /src/backend/web/dist ./web/dist
RUN --mount=type=cache,target=/root/.cache/go-build \
    set -eux; \
    case "${TARGETOS}/${TARGETARCH}${TARGETVARIANT}" in \
      linux/amd64) zig_target="x86_64-linux-musl" ;; \
      linux/arm64) zig_target="aarch64-linux-musl" ;; \
      *) echo "unsupported target platform: ${TARGETOS}/${TARGETARCH}${TARGETVARIANT}" >&2; exit 1 ;; \
    esac; \
    env \
      CGO_ENABLED=1 \
      CC="zig cc -target ${zig_target}" \
      GOOS="${TARGETOS}" \
      GOARCH="${TARGETARCH}" \
      go build \
        -trimpath \
        -ldflags="-s -w -linkmode external -extldflags=-static -X main.AppVersion=${APP_VERSION}" \
        -o /out/mqtt-shark \
        ./cmd/mqtt-shark

FROM alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=build /out/mqtt-shark /app/mqtt-shark

EXPOSE 8080
CMD ["/app/mqtt-shark"]
