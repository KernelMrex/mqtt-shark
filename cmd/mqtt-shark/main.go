package main

import (
	"errors"
	"log"
	"net/http"
	"os"

	"github.com/mqtt-shark/mqtt-shark/internal/app"
	"github.com/mqtt-shark/mqtt-shark/web"
)

func main() {
	logger := log.New(os.Stdout, "", log.LstdFlags)

	server, err := app.New(app.Config{
		Addr:     ":" + env("PORT", "8080"),
		Logger:   logger,
		PublicFS: web.Static(),
	})
	if err != nil {
		logger.Fatalf("configure server: %v", err)
	}

	logger.Printf("MQTT Shark is listening on http://0.0.0.0%s", server.Addr)
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
