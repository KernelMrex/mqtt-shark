package app

import (
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/mqtt-shark/mqtt-shark/internal/realtime"
)

type Config struct {
	Addr     string
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

	logger := config.Logger
	if logger == nil {
		logger = log.New(os.Stdout, "", log.LstdFlags)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(config.PublicFS)))
	mux.HandleFunc("/api/ws", realtime.Handle(logger))

	return &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}, nil
}
