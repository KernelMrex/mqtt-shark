package realtime

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gorilla/websocket"
	"github.com/mqtt-shark/mqtt-shark/internal/mqttutil"
)

type command struct {
	Type     string `json:"type"`
	URL      string `json:"url,omitempty"`
	ClientID string `json:"clientId,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Clean    *bool  `json:"clean,omitempty"`
	Topic    string `json:"topic,omitempty"`
	Payload  string `json:"payload,omitempty"`
	QoS      int    `json:"qos,omitempty"`
	Retain   bool   `json:"retain,omitempty"`
}

type response map[string]any

type session struct {
	logger      *log.Logger
	ws          *websocket.Conn
	writeMu     sync.Mutex
	mqttMu      sync.Mutex
	mqttClient  mqtt.Client
	subscribers map[string]struct{}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func Handle(logger *log.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.Printf("websocket upgrade failed: %v", err)
			return
		}

		current := &session{
			logger:      logger,
			ws:          conn,
			subscribers: make(map[string]struct{}),
		}
		defer current.close()

		current.send("status", response{"status": "idle"})

		for {
			var message command
			if err := conn.ReadJSON(&message); err != nil {
				if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
					logger.Printf("read websocket command: %v", err)
				}
				return
			}

			current.handle(message)
		}
	}
}

func (s *session) handle(command command) {
	switch command.Type {
	case "connect":
		s.connect(command)
	case "disconnect":
		s.disconnect()
	case "subscribe":
		s.subscribe(command)
	case "unsubscribe":
		s.unsubscribe(command)
	case "publish":
		s.publish(command)
	default:
		s.sendError(fmt.Sprintf("unknown command: %s", command.Type))
	}
}

func (s *session) connect(command command) {
	brokerURL := mqttutil.NormalizeBrokerURL(command.URL)
	if brokerURL == "" {
		s.sendError("broker URL is required")
		return
	}

	s.disconnectMQTT()

	clean := true
	if command.Clean != nil {
		clean = *command.Clean
	}

	clientID := strings.TrimSpace(command.ClientID)
	if clientID == "" {
		clientID = fmt.Sprintf("mqtt-shark-%d", time.Now().UnixNano())
	}

	options := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(clientID).
		SetCleanSession(clean).
		SetAutoReconnect(true).
		SetConnectRetry(false).
		SetConnectTimeout(8 * time.Second).
		SetKeepAlive(30 * time.Second).
		SetPingTimeout(10 * time.Second)

	if command.Username != "" {
		options.SetUsername(command.Username)
	}
	if command.Password != "" {
		options.SetPassword(command.Password)
	}

	options.SetOnConnectHandler(func(client mqtt.Client) {
		s.send("status", response{"status": "connected"})
	})
	options.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		s.send("status", response{"status": "disconnected"})
		if err != nil {
			s.sendError(err.Error())
		}
	})
	options.SetReconnectingHandler(func(client mqtt.Client, opts *mqtt.ClientOptions) {
		s.send("status", response{"status": "reconnecting"})
	})

	client := mqtt.NewClient(options)
	s.setMQTTClient(client)
	s.send("status", response{"status": "connecting"})

	token := client.Connect()
	if !token.WaitTimeout(9 * time.Second) {
		s.disconnectMQTT()
		s.sendError("MQTT connection timed out")
		return
	}
	if err := token.Error(); err != nil {
		s.disconnectMQTT()
		s.sendError(err.Error())
		return
	}
}

func (s *session) disconnect() {
	s.disconnectMQTT()
	s.send("status", response{"status": "disconnected"})
}

func (s *session) subscribe(command command) {
	client, ok := s.client()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic := strings.TrimSpace(command.Topic)
	if topic == "" {
		s.sendError("topic is required")
		return
	}

	qos, err := mqttutil.ValidQoS(command.QoS)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	token := client.Subscribe(topic, qos, func(client mqtt.Client, message mqtt.Message) {
		s.send("message", response{
			"topic":      message.Topic(),
			"payload":    string(message.Payload()),
			"qos":        message.Qos(),
			"retain":     message.Retained(),
			"receivedAt": time.Now().UTC().Format(time.RFC3339Nano),
		})
	})

	token.Wait()
	if err := token.Error(); err != nil {
		s.sendError(err.Error())
		return
	}

	s.mqttMu.Lock()
	s.subscribers[topic] = struct{}{}
	s.mqttMu.Unlock()
	s.send("subscription", response{"topic": topic, "subscribed": true})
}

func (s *session) unsubscribe(command command) {
	client, ok := s.client()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic := strings.TrimSpace(command.Topic)
	if topic == "" {
		s.sendError("topic is required")
		return
	}

	token := client.Unsubscribe(topic)
	token.Wait()
	if err := token.Error(); err != nil {
		s.sendError(err.Error())
		return
	}

	s.mqttMu.Lock()
	delete(s.subscribers, topic)
	s.mqttMu.Unlock()
	s.send("subscription", response{"topic": topic, "subscribed": false})
}

func (s *session) publish(command command) {
	client, ok := s.client()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic := strings.TrimSpace(command.Topic)
	if topic == "" {
		s.sendError("topic is required")
		return
	}

	qos, err := mqttutil.ValidQoS(command.QoS)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	token := client.Publish(topic, qos, command.Retain, command.Payload)
	token.Wait()
	if err := token.Error(); err != nil {
		s.sendError(err.Error())
		return
	}

	s.send("published", response{"topic": topic})
}

func (s *session) send(kind string, payload response) {
	payload["type"] = kind
	body, err := json.Marshal(payload)
	if err != nil {
		s.logger.Printf("marshal websocket response: %v", err)
		return
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	if err := s.ws.WriteMessage(websocket.TextMessage, body); err != nil {
		s.logger.Printf("write websocket response: %v", err)
	}
}

func (s *session) sendError(message string) {
	s.send("error", response{"message": message})
}

func (s *session) client() (mqtt.Client, bool) {
	s.mqttMu.Lock()
	defer s.mqttMu.Unlock()

	if s.mqttClient == nil || !s.mqttClient.IsConnectionOpen() {
		return nil, false
	}

	return s.mqttClient, true
}

func (s *session) setMQTTClient(client mqtt.Client) {
	s.mqttMu.Lock()
	defer s.mqttMu.Unlock()
	s.mqttClient = client
}

func (s *session) disconnectMQTT() {
	s.mqttMu.Lock()
	defer s.mqttMu.Unlock()

	if s.mqttClient != nil {
		s.mqttClient.Disconnect(250)
		s.mqttClient = nil
	}
	s.subscribers = make(map[string]struct{})
}

func (s *session) close() {
	s.disconnectMQTT()
	_ = s.ws.Close()
}
