package paho

import "testing"

func TestNormalizeBrokerURL(t *testing.T) {
	tests := map[string]string{
		"mqtt://localhost:1883":       "tcp://localhost:1883",
		" mqtt://localhost:1883 ":     "tcp://localhost:1883",
		"mqtts://broker.example:8883": "ssl://broker.example:8883",
		"tcp://localhost:1883":        "tcp://localhost:1883",
		"ws://localhost:9001":         "ws://localhost:9001",
	}

	for input, expected := range tests {
		if actual := normalizeBrokerURL(input); actual != expected {
			t.Fatalf("normalizeBrokerURL(%q) = %q, want %q", input, actual, expected)
		}
	}
}
