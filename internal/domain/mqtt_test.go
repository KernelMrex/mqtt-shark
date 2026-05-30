package domain

import "testing"

func TestNewBrokerURL(t *testing.T) {
	tests := map[string]string{
		"mqtt://localhost:1883":   "mqtt://localhost:1883",
		" mqtt://localhost:1883 ": "mqtt://localhost:1883",
		"tcp://localhost:1883":    "tcp://localhost:1883",
		"ws://localhost:9001":     "ws://localhost:9001",
	}

	for input, expected := range tests {
		actual, err := NewBrokerURL(input)
		if err != nil {
			t.Fatalf("NewBrokerURL(%q) returned error: %v", input, err)
		}
		if string(actual) != expected {
			t.Fatalf("NewBrokerURL(%q) = %q, want %q", input, actual, expected)
		}
	}

	if _, err := NewBrokerURL(" "); err == nil {
		t.Fatal("NewBrokerURL returned nil error for empty URL")
	}
}

func TestNewTopic(t *testing.T) {
	actual, err := NewTopic(" sensors/temp ")
	if err != nil {
		t.Fatalf("NewTopic returned error: %v", err)
	}
	if string(actual) != "sensors/temp" {
		t.Fatalf("NewTopic trimmed to %q, want sensors/temp", actual)
	}

	if _, err := NewTopic(""); err == nil {
		t.Fatal("NewTopic returned nil error for empty topic")
	}
}

func TestNewQoS(t *testing.T) {
	for _, qos := range []int{0, 1, 2} {
		if _, err := NewQoS(qos); err != nil {
			t.Fatalf("NewQoS(%d) returned error: %v", qos, err)
		}
	}

	for _, qos := range []int{-1, 3} {
		if _, err := NewQoS(qos); err == nil {
			t.Fatalf("NewQoS(%d) returned nil error", qos)
		}
	}
}
