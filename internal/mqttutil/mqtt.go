package mqttutil

import (
	"fmt"
	"strings"
)

func NormalizeBrokerURL(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if strings.HasPrefix(trimmed, "mqtt://") {
		return "tcp://" + strings.TrimPrefix(trimmed, "mqtt://")
	}
	if strings.HasPrefix(trimmed, "mqtts://") {
		return "ssl://" + strings.TrimPrefix(trimmed, "mqtts://")
	}
	return trimmed
}

func ValidQoS(qos int) (byte, error) {
	if qos < 0 || qos > 2 {
		return 0, fmt.Errorf("invalid QoS: %d", qos)
	}
	return byte(qos), nil
}
