package mqttutil

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
		if actual := NormalizeBrokerURL(input); actual != expected {
			t.Fatalf("NormalizeBrokerURL(%q) = %q, want %q", input, actual, expected)
		}
	}
}

func TestValidQoS(t *testing.T) {
	for _, qos := range []int{0, 1, 2} {
		if _, err := ValidQoS(qos); err != nil {
			t.Fatalf("ValidQoS(%d) returned error: %v", qos, err)
		}
	}

	for _, qos := range []int{-1, 3} {
		if _, err := ValidQoS(qos); err == nil {
			t.Fatalf("ValidQoS(%d) returned nil error", qos)
		}
	}
}
