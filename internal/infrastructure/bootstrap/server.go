package bootstrap

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/mqtt-shark/mqtt-shark/internal/infrastructure/mqtt/paho"
	"github.com/mqtt-shark/mqtt-shark/internal/infrastructure/realtime"
)

type Config struct {
	Addr     string
	Version  string
	Logger   *log.Logger
	PublicFS fs.FS
}

func New(config Config) (*http.Server, error) {
	if config.PublicFS == nil {
		return nil, errors.New("public filesystem is required")
	}

	addr := config.Addr
	if addr == "" {
		addr = ":8080"
	}

	version := config.Version
	if version == "" {
		version = "dev"
	}

	logger := config.Logger
	if logger == nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"name":    "mqtt-shark",
			"version": version,
		})
	})
	mux.Handle("/", http.FileServer(http.FS(config.PublicFS)))
	mux.HandleFunc("/api/ws", realtime.Handle(logger, paho.Factory{}))

	return &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}, nil
}
