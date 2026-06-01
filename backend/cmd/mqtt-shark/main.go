package main

import (
	"errors"
	"log"
	"net/http"
	"os"

	"github.com/KernelMrex/mqtt-shark/internal/infrastructure/bootstrap"
	"github.com/KernelMrex/mqtt-shark/web"
)

// AppVersion Populated by -ldflags "-X main.AppVersion=..."
var AppVersion = "dev"

func main() {
	logger := log.New(os.Stdout, "", log.LstdFlags)

	server, err := bootstrap.New(bootstrap.Config{
		Addr:              ":" + env("PORT", "8080"),
		Version:           AppVersion,
		DefaultBrokerHost: env("MQTT_SHARK_BROKER_HOST", ""),
		Logger:            logger,
		PublicFS:          web.Static(),
	})
	if err != nil {
		logger.Fatalf("configure server: %v", err)
	}

	logger.Printf("MQTT Shark %s is listening on http://0.0.0.0%s", AppVersion, server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Fatalf("server failed: %v", err)
	}
}

func env(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
