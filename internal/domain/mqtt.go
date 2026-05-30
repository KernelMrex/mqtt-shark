package domain

import (
	"fmt"
	"strings"
	"time"
)

type BrokerURL string

func NewBrokerURL(rawURL string) (BrokerURL, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "", fmt.Errorf("broker URL is required")
	}
	return BrokerURL(trimmed), nil
}

type Topic string

func NewTopic(rawTopic string) (Topic, error) {
	trimmed := strings.TrimSpace(rawTopic)
	if trimmed == "" {
		return "", fmt.Errorf("topic is required")
	}
	return Topic(trimmed), nil
}

type QoS byte

func NewQoS(qos int) (QoS, error) {
	if qos < 0 || qos > 2 {
		return 0, fmt.Errorf("invalid QoS: %d", qos)
	}
	return QoS(qos), nil
}

func (q QoS) Byte() byte {
	return byte(q)
}

func (q QoS) Int() int {
	return int(q)
}

type Message struct {
	Topic      Topic
	Payload    []byte
	QoS        QoS
	Retain     bool
	ReceivedAt time.Time
}

type SessionStatus string

const (
	SessionStatusIdle         SessionStatus = "idle"
	SessionStatusConnecting   SessionStatus = "connecting"
	SessionStatusConnected    SessionStatus = "connected"
	SessionStatusDisconnected SessionStatus = "disconnected"
	SessionStatusReconnecting SessionStatus = "reconnecting"
)
