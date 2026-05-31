package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var staticFiles embed.FS

func Static() fs.FS {
	publicRoot, err := fs.Sub(staticFiles, "dist")
	if err != nil {
		panic(err)
	}
	return publicRoot
}
