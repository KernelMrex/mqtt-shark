package realtime

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mqtt-shark/mqtt-shark/internal/domain"
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

type wsSession struct {
	logger  *log.Logger
	ws      *websocket.Conn
	writeMu sync.Mutex
	session *domain.MQTTSession
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func Handle(logger *log.Logger, mqttFactory domain.MQTTClientFactory) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.Printf("websocket upgrade failed: %v", err)
			return
		}

		current := &wsSession{
			logger: logger,
			ws:     conn,
		}
		current.session = domain.NewMQTTSession(mqttFactory, current.sendEvent)
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

func (s *wsSession) handle(command command) {
	switch command.Type {
	case "connect":
		s.session.Connect(domain.MQTTConnectCommand{
			URL:      command.URL,
			ClientID: command.ClientID,
			Username: command.Username,
			Password: command.Password,
			Clean:    command.Clean,
		})
	case "disconnect":
		s.session.Disconnect()
	case "subscribe":
		s.session.Subscribe(domain.MQTTSubscribeCommand{
			Topic: command.Topic,
			QoS:   command.QoS,
		})
	case "unsubscribe":
		s.session.Unsubscribe(domain.MQTTUnsubscribeCommand{
			Topic: command.Topic,
		})
	case "publish":
		s.session.Publish(domain.MQTTPublishCommand{
			Topic:   command.Topic,
			Payload: command.Payload,
			QoS:     command.QoS,
			Retain:  command.Retain,
		})
	default:
		s.sendError(fmt.Sprintf("unknown command: %s", command.Type))
	}
}

func (s *wsSession) sendEvent(event domain.MQTTSessionEvent) {
	switch event.Type {
	case domain.MQTTSessionEventStatus:
		s.send("status", response{"status": string(event.Status)})
	case domain.MQTTSessionEventMessage:
		s.send("message", response{
			"topic":      string(event.Message.Topic),
			"payload":    string(event.Message.Payload),
			"qos":        event.Message.QoS.Int(),
			"retain":     event.Message.Retain,
			"receivedAt": event.Message.ReceivedAt.UTC().Format(time.RFC3339Nano),
		})
	case domain.MQTTSessionEventSubscription:
		s.send("subscription", response{
			"topic":      string(event.Topic),
			"subscribed": event.Subscribed,
		})
	case domain.MQTTSessionEventPublished:
		s.send("published", response{"topic": string(event.Topic)})
	case domain.MQTTSessionEventError:
		s.sendError(event.Error)
	}
}

func (s *wsSession) send(kind string, payload response) {
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

func (s *wsSession) sendError(message string) {
	s.send("error", response{"message": message})
}

func (s *wsSession) close() {
	s.session.Close()
	_ = s.ws.Close()
}
