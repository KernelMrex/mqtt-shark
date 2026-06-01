package bootstrap

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestInfoEndpointIncludesDefaultBrokerHost(t *testing.T) {
	server, err := New(Config{
		Version:           "test-version",
		DefaultBrokerHost: "192.168.1.50",
		PublicFS: fstest.MapFS{
			"index.html": &fstest.MapFile{Mode: fs.ModePerm},
		},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/info", nil)
	response := httptest.NewRecorder()
	server.Handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var info map[string]string
	if err := json.NewDecoder(response.Body).Decode(&info); err != nil {
		t.Fatalf("decode info: %v", err)
	}

	if info["defaultBrokerHost"] != "192.168.1.50" {
		t.Fatalf("defaultBrokerHost = %q, want %q", info["defaultBrokerHost"], "192.168.1.50")
	}
}
