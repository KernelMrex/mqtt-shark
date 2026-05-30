package paho

import (
	"errors"
	"strings"
	"time"

	"github.com/KernelMrex/mqtt-shark/internal/domain"
	pahomqtt "github.com/eclipse/paho.mqtt.golang"
)

type Factory struct{}

func (Factory) New(config domain.MQTTConnectionConfig, handlers domain.MQTTConnectionHandlers) domain.MQTTClient {
	return &Client{
		config:   config,
		handlers: handlers,
	}
}

type Client struct {
	config   domain.MQTTConnectionConfig
	handlers domain.MQTTConnectionHandlers
	client   pahomqtt.Client
}

func (c *Client) Connect() error {
	options := pahomqtt.NewClientOptions().
		AddBroker(normalizeBrokerURL(string(c.config.BrokerURL))).
		SetClientID(c.config.ClientID).
		SetCleanSession(c.config.Clean).
		SetAutoReconnect(true).
		SetConnectRetry(false).
		SetConnectTimeout(8 * time.Second).
		SetKeepAlive(30 * time.Second).
		SetPingTimeout(10 * time.Second)

	if c.config.Username != "" {
		options.SetUsername(c.config.Username)
	}
	if c.config.Password != "" {
		options.SetPassword(c.config.Password)
	}

	options.SetOnConnectHandler(func(client pahomqtt.Client) {
		if c.handlers.OnConnected != nil {
			c.handlers.OnConnected()
		}
	})
	options.SetConnectionLostHandler(func(client pahomqtt.Client, err error) {
		if c.handlers.OnDisconnected != nil {
			c.handlers.OnDisconnected(err)
		}
	})
	options.SetReconnectingHandler(func(client pahomqtt.Client, opts *pahomqtt.ClientOptions) {
		if c.handlers.OnReconnecting != nil {
			c.handlers.OnReconnecting()
		}
	})

	c.client = pahomqtt.NewClient(options)
	token := c.client.Connect()
	if !token.WaitTimeout(9 * time.Second) {
		c.Disconnect()
		return errors.New("MQTT connection timed out")
	}
	if err := token.Error(); err != nil {
		c.Disconnect()
		return err
	}

	return nil
}

func (c *Client) Disconnect() {
	if c.client != nil {
		c.client.Disconnect(250)
		c.client = nil
	}
}

func (c *Client) IsConnected() bool {
	return c.client != nil && c.client.IsConnectionOpen()
}

func (c *Client) Subscribe(topic domain.Topic, qos domain.QoS, handler domain.MQTTMessageHandler) error {
	token := c.client.Subscribe(string(topic), qos.Byte(), func(client pahomqtt.Client, message pahomqtt.Message) {
		handler(domain.Message{
			Topic:   domain.Topic(message.Topic()),
			Payload: append([]byte(nil), message.Payload()...),
			QoS:     domain.QoS(message.Qos()),
			Retain:  message.Retained(),
		})
	})

	token.Wait()
	return token.Error()
}

func (c *Client) Unsubscribe(topic domain.Topic) error {
	token := c.client.Unsubscribe(string(topic))
	token.Wait()
	return token.Error()
}

func (c *Client) Publish(topic domain.Topic, qos domain.QoS, retain bool, payload []byte) error {
	token := c.client.Publish(string(topic), qos.Byte(), retain, payload)
	token.Wait()
	return token.Error()
}

func normalizeBrokerURL(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if strings.HasPrefix(trimmed, "mqtt://") {
		return "tcp://" + strings.TrimPrefix(trimmed, "mqtt://")
	}
	if strings.HasPrefix(trimmed, "mqtts://") {
		return "ssl://" + strings.TrimPrefix(trimmed, "mqtts://")
	}
	return trimmed
}
