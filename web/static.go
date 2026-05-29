package web

import (
	"embed"
	"io/fs"
)

//go:embed static/*
var staticFiles embed.FS

func Static() fs.FS {
	publicRoot, err := fs.Sub(staticFiles, "static")
	if err != nil {
		panic(err)
	}
	return publicRoot
}
