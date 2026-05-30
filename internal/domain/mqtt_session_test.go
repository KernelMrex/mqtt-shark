package domain

import (
	"errors"
	"testing"
)

func TestMQTTSessionSubscribeRequiresConnectedClient(t *testing.T) {
	var events []MQTTSessionEvent
	session := NewMQTTSession(fakeFactory{}, func(event MQTTSessionEvent) {
		events = append(events, event)
	})

	session.Subscribe(MQTTSubscribeCommand{Topic: "sensors/temp", QoS: 1})

	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	if events[0].Type != MQTTSessionEventError || events[0].Error != "connect to a broker first" {
		t.Fatalf("got event %#v, want connect-first error", events[0])
	}
}

func TestMQTTSessionConnectPublishesStatusEvents(t *testing.T) {
	var events []MQTTSessionEvent
	client := &fakeClient{}
	session := NewMQTTSession(fakeFactory{client: client}, func(event MQTTSessionEvent) {
		events = append(events, event)
	})

	session.Connect(MQTTConnectCommand{URL: " mqtt://localhost:1883 "})

	if len(events) != 2 {
		t.Fatalf("got %d events, want 2", len(events))
	}
	if events[0].Status != SessionStatusConnecting {
		t.Fatalf("first status = %q, want connecting", events[0].Status)
	}
	if events[1].Status != SessionStatusConnected {
		t.Fatalf("second status = %q, want connected", events[1].Status)
	}
	if client.config.BrokerURL != "mqtt://localhost:1883" {
		t.Fatalf("broker URL = %q, want trimmed URL", client.config.BrokerURL)
	}
	if client.config.ClientID == "" {
		t.Fatal("client ID was not generated")
	}
}

func TestMQTTSessionPublishUsesValidatedInputs(t *testing.T) {
	var events []MQTTSessionEvent
	client := &fakeClient{connected: true}
	session := NewMQTTSession(fakeFactory{client: client}, func(event MQTTSessionEvent) {
		events = append(events, event)
	})
	session.Connect(MQTTConnectCommand{URL: "mqtt://localhost:1883"})
	events = nil

	session.Publish(MQTTPublishCommand{
		Topic:   " sensors/temp ",
		Payload: "42",
		QoS:     1,
		Retain:  true,
	})

	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	if events[0].Type != MQTTSessionEventPublished || events[0].Topic != "sensors/temp" {
		t.Fatalf("got event %#v, want published event for trimmed topic", events[0])
	}
	if client.publishedTopic != "sensors/temp" || string(client.publishedPayload) != "42" {
		t.Fatalf("published %#v with payload %q, want sensors/temp payload 42", client.publishedTopic, client.publishedPayload)
	}
	if client.publishedQoS != 1 || !client.publishedRetain {
		t.Fatalf("published qos=%d retain=%t, want qos=1 retain=true", client.publishedQoS, client.publishedRetain)
	}
}

func TestMQTTSessionPublishReportsInvalidQoS(t *testing.T) {
	var events []MQTTSessionEvent
	session := NewMQTTSession(fakeFactory{client: &fakeClient{connected: true}}, func(event MQTTSessionEvent) {
		events = append(events, event)
	})
	session.Connect(MQTTConnectCommand{URL: "mqtt://localhost:1883"})
	events = nil

	session.Publish(MQTTPublishCommand{Topic: "sensors/temp", QoS: 3})

	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	if events[0].Type != MQTTSessionEventError || events[0].Error != "invalid QoS: 3" {
		t.Fatalf("got event %#v, want invalid QoS error", events[0])
	}
}

type fakeFactory struct {
	client *fakeClient
}

func (f fakeFactory) New(config MQTTConnectionConfig, handlers MQTTConnectionHandlers) MQTTClient {
	client := f.client
	if client == nil {
		client = &fakeClient{}
	}
	client.config = config
	client.handlers = handlers
	return client
}

type fakeClient struct {
	config   MQTTConnectionConfig
	handlers MQTTConnectionHandlers

	connectErr error
	connected  bool

	publishedTopic   Topic
	publishedQoS     QoS
	publishedRetain  bool
	publishedPayload []byte
}

func (c *fakeClient) Connect() error {
	if c.connectErr != nil {
		return c.connectErr
	}
	c.connected = true
	c.handlers.OnConnected()
	return nil
}

func (c *fakeClient) Disconnect() {
	c.connected = false
}

func (c *fakeClient) IsConnected() bool {
	return c.connected
}

func (c *fakeClient) Subscribe(topic Topic, qos QoS, handler MQTTMessageHandler) error {
	if !c.connected {
		return errors.New("not connected")
	}
	return nil
}

func (c *fakeClient) Unsubscribe(topic Topic) error {
	if !c.connected {
		return errors.New("not connected")
	}
	return nil
}

func (c *fakeClient) Publish(topic Topic, qos QoS, retain bool, payload []byte) error {
	if !c.connected {
		return errors.New("not connected")
	}
	c.publishedTopic = topic
	c.publishedQoS = qos
	c.publishedRetain = retain
	c.publishedPayload = append([]byte(nil), payload...)
	return nil
}
