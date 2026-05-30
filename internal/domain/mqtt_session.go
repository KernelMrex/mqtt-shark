package domain

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

type MQTTConnectCommand struct {
	URL      string
	ClientID string
	Username string
	Password string
	Clean    *bool
}

type MQTTSubscribeCommand struct {
	Topic string
	QoS   int
}

type MQTTUnsubscribeCommand struct {
	Topic string
}

type MQTTPublishCommand struct {
	Topic   string
	Payload string
	QoS     int
	Retain  bool
}

type MQTTConnectionConfig struct {
	BrokerURL BrokerURL
	ClientID  string
	Username  string
	Password  string
	Clean     bool
}

type MQTTConnectionHandlers struct {
	OnConnected    func()
	OnDisconnected func(error)
	OnReconnecting func()
}

type MQTTMessageHandler func(Message)

type MQTTClient interface {
	Connect() error
	Disconnect()
	IsConnected() bool
	Subscribe(Topic, QoS, MQTTMessageHandler) error
	Unsubscribe(Topic) error
	Publish(Topic, QoS, bool, []byte) error
}

type MQTTClientFactory interface {
	New(MQTTConnectionConfig, MQTTConnectionHandlers) MQTTClient
}

type MQTTSessionEventType string

const (
	MQTTSessionEventStatus       MQTTSessionEventType = "status"
	MQTTSessionEventMessage      MQTTSessionEventType = "message"
	MQTTSessionEventSubscription MQTTSessionEventType = "subscription"
	MQTTSessionEventPublished    MQTTSessionEventType = "published"
	MQTTSessionEventError        MQTTSessionEventType = "error"
)

type MQTTSessionEvent struct {
	Type       MQTTSessionEventType
	Status     SessionStatus
	Message    Message
	Topic      Topic
	Subscribed bool
	Error      string
}

type MQTTSessionEventSink func(MQTTSessionEvent)

type MQTTSession struct {
	mu          sync.Mutex
	client      MQTTClient
	subscribers map[Topic]struct{}
	newClient   MQTTClientFactory
	emit        MQTTSessionEventSink
	now         func() time.Time
}

func NewMQTTSession(newClient MQTTClientFactory, emit MQTTSessionEventSink) *MQTTSession {
	return &MQTTSession{
		subscribers: make(map[Topic]struct{}),
		newClient:   newClient,
		emit:        emit,
		now:         time.Now,
	}
}

func (s *MQTTSession) Connect(command MQTTConnectCommand) {
	brokerURL, err := NewBrokerURL(command.URL)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	s.disconnectMQTT()

	clean := true
	if command.Clean != nil {
		clean = *command.Clean
	}

	clientID := strings.TrimSpace(command.ClientID)
	if clientID == "" {
		clientID = fmt.Sprintf("mqtt-shark-%d", s.now().UnixNano())
	}

	client := s.newClient.New(MQTTConnectionConfig{
		BrokerURL: brokerURL,
		ClientID:  clientID,
		Username:  command.Username,
		Password:  command.Password,
		Clean:     clean,
	}, MQTTConnectionHandlers{
		OnConnected: func() {
			s.sendStatus(SessionStatusConnected)
		},
		OnDisconnected: func(err error) {
			s.sendStatus(SessionStatusDisconnected)
			if err != nil {
				s.sendError(err.Error())
			}
		},
		OnReconnecting: func() {
			s.sendStatus(SessionStatusReconnecting)
		},
	})

	s.setClient(client)
	s.sendStatus(SessionStatusConnecting)

	if err := client.Connect(); err != nil {
		s.disconnectMQTT()
		s.sendError(err.Error())
		return
	}
}

func (s *MQTTSession) Disconnect() {
	s.disconnectMQTT()
	s.sendStatus(SessionStatusDisconnected)
}

func (s *MQTTSession) Subscribe(command MQTTSubscribeCommand) {
	client, ok := s.connectedClient()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic, err := NewTopic(command.Topic)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	qos, err := NewQoS(command.QoS)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	err = client.Subscribe(topic, qos, func(message Message) {
		if message.ReceivedAt.IsZero() {
			message.ReceivedAt = s.now().UTC()
		}
		s.send(MQTTSessionEvent{
			Type:    MQTTSessionEventMessage,
			Message: message,
		})
	})
	if err != nil {
		s.sendError(err.Error())
		return
	}

	s.mu.Lock()
	s.subscribers[topic] = struct{}{}
	s.mu.Unlock()

	s.send(MQTTSessionEvent{
		Type:       MQTTSessionEventSubscription,
		Topic:      topic,
		Subscribed: true,
	})
}

func (s *MQTTSession) Unsubscribe(command MQTTUnsubscribeCommand) {
	client, ok := s.connectedClient()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic, err := NewTopic(command.Topic)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	if err := client.Unsubscribe(topic); err != nil {
		s.sendError(err.Error())
		return
	}

	s.mu.Lock()
	delete(s.subscribers, topic)
	s.mu.Unlock()

	s.send(MQTTSessionEvent{
		Type:       MQTTSessionEventSubscription,
		Topic:      topic,
		Subscribed: false,
	})
}

func (s *MQTTSession) Publish(command MQTTPublishCommand) {
	client, ok := s.connectedClient()
	if !ok {
		s.sendError("connect to a broker first")
		return
	}

	topic, err := NewTopic(command.Topic)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	qos, err := NewQoS(command.QoS)
	if err != nil {
		s.sendError(err.Error())
		return
	}

	if err := client.Publish(topic, qos, command.Retain, []byte(command.Payload)); err != nil {
		s.sendError(err.Error())
		return
	}

	s.send(MQTTSessionEvent{
		Type:  MQTTSessionEventPublished,
		Topic: topic,
	})
}

func (s *MQTTSession) Close() {
	s.disconnectMQTT()
}

func (s *MQTTSession) connectedClient() (MQTTClient, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.client == nil || !s.client.IsConnected() {
		return nil, false
	}

	return s.client, true
}

func (s *MQTTSession) setClient(client MQTTClient) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.client = client
}

func (s *MQTTSession) disconnectMQTT() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.client != nil {
		s.client.Disconnect()
		s.client = nil
	}
	s.subscribers = make(map[Topic]struct{})
}

func (s *MQTTSession) sendStatus(status SessionStatus) {
	s.send(MQTTSessionEvent{
		Type:   MQTTSessionEventStatus,
		Status: status,
	})
}

func (s *MQTTSession) sendError(message string) {
	s.send(MQTTSessionEvent{
		Type:  MQTTSessionEventError,
		Error: message,
	})
}

func (s *MQTTSession) send(event MQTTSessionEvent) {
	if s.emit != nil {
		s.emit(event)
	}
}
