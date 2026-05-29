FROM golang:1.24-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY web ./web
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/mqtt-shark ./cmd/mqtt-shark

FROM alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=build /out/mqtt-shark /app/mqtt-shark

EXPOSE 8080
CMD ["/app/mqtt-shark"]
