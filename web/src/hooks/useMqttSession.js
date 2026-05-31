import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialSession, visibleMessages } from "../constants/session";
import {
  countMessagesForTopic,
  isSelectedMessageOutside,
  messagesForTopic
} from "../model/messageModel";
import { brokerURLFromForm } from "../utils/broker";
import { createMessageId } from "../utils/message";
import { formatPayload } from "../utils/payload";
import {
  getDiscoveredTopics,
  isWildcardTopic
} from "../utils/topic";
import { getConnectedSession, sessionReducer } from "./sessionReducer";
import { useReconnectLoop } from "./useReconnectLoop";
import { useWebSocketConnection } from "./useWebSocketConnection";

export const useMqttSession = () => {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [status, setStatusValue] = useState("idle");
  const [connectFeedback, setConnectFeedback] = useState("");
  const [appFeedback, setAppFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [appFeedbackIsError, setAppFeedbackIsError] = useState(false);
  const stateRef = useRef(state);
  const websocketHandlersRef = useRef({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { socketRef, send } = useWebSocketConnection({
    url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
    handlersRef: websocketHandlersRef,
    onUnavailable: () => {
      setConnectFeedback("WebSocket is not connected");
      setFeedbackIsError(true);
    }
  });

  const reconnect = useReconnectLoop({
    stateRef,
    socketRef,
    send,
    dispatch,
    onMissingReconnectCommand: () => {
      setAppFeedback("Broker connection lost. Reconnect from the connection screen.");
      setAppFeedbackIsError(true);
    }
  });

  const restoreSubscriptions = (snapshot = stateRef.current) => {
    const topics = [...snapshot.subscriptions];

    if (snapshot.discovering) {
      topics.push("#");
    }

    dispatch({ type: "restoreTopicsQueued", topics });

    window.setTimeout(() => {
      for (const topic of topics) {
        const qos = topic === "#" ? 0 : snapshot.subscriptionQoS[topic] ?? 0;
        send({ type: "subscribe", topic, qos });
      }
    }, 0);
  };

  const updateStatus = (nextStatus) => {
    setStatusValue(nextStatus);

    if (nextStatus === "connecting") {
      dispatch({ type: "connectingStatusReceived" });
      if (stateRef.current.reconnectActive) {
        reconnect.setReconnectDetail("Reconnecting...");
      }
      setConnectFeedback("Connecting...");
      setFeedbackIsError(false);
      return;
    }

    if (nextStatus === "connected") {
      const wasReconnecting = stateRef.current.reconnectActive;
      const connectedSnapshot = getConnectedSession(stateRef.current);
      const shouldStartDiscovery = stateRef.current.autoDiscoveryOnConnect && !wasReconnecting;

      dispatch({ type: "brokerConnected" });

      if (wasReconnecting) {
        window.setTimeout(() => restoreSubscriptions(connectedSnapshot), 0);
        setAppFeedback("Reconnected to broker");
        setAppFeedbackIsError(false);
      } else if (shouldStartDiscovery) {
        window.setTimeout(() => {
          dispatch({ type: "discoveryStartRequested" });
          send({ type: "subscribe", topic: "#", qos: 0 });
        }, 0);
      }

      reconnect.stopReconnectLoop();
      setConnectFeedback("");
      setFeedbackIsError(false);
      setAppFeedback("");
      setAppFeedbackIsError(false);
      return;
    }

    if (nextStatus === "reconnecting" && stateRef.current.connected) {
      reconnect.startReconnectLoop("Broker is reconnecting...");
      return;
    }

    if (nextStatus === "disconnected" && stateRef.current.connected) {
      if (stateRef.current.manualDisconnecting) {
        reconnect.stopReconnectLoop();
        dispatch({ type: "manualDisconnectCompleted" });
        setConnectFeedback("Disconnected from broker");
        setFeedbackIsError(true);
        return;
      }

      reconnect.startReconnectLoop("Broker connection lost. Reconnect is required.");
    }
  };

  const resetSession = () => {
    reconnect.stopReconnectLoop();
    dispatch({ type: "resetSession" });
  };

  const handleErrorMessage = (message) => {
    dispatch({ type: "discoveryActionFailed" });
    reconnect.markReconnectAttemptFailed(message.message);
    updateStatus("error");

    if (stateRef.current.connected) {
      setAppFeedback(message.message);
      setAppFeedbackIsError(true);
    } else {
      setConnectFeedback(message.message);
      setFeedbackIsError(true);
    }
  };

  const handleBrokerMessage = (message) => {
    setAppFeedback("");
    setAppFeedbackIsError(false);
    dispatch({
      type: "brokerMessageReceived",
      message: {
        id: createMessageId(),
        topic: message.topic,
        payload: message.payload,
        qos: message.qos,
        retain: message.retain,
        receivedAt: message.receivedAt
      }
    });
  };

  const handleSubscriptionMessage = (message) => {
    const current = stateRef.current;

    if (current.restoringTopics.includes(message.topic)) {
      dispatch({ type: "restoreSubscriptionConfirmed", topic: message.topic });
      return;
    }

    if (message.topic === "#" && current.pendingDiscoveryAction) {
      dispatch({ type: "discoverySubscriptionChanged", subscribed: message.subscribed });
      setAppFeedback(message.subscribed ? "Discovering topics through #" : "Stopped topic discovery");
      setAppFeedbackIsError(false);
      return;
    }

    dispatch({ type: "subscriptionChanged", topic: message.topic, subscribed: message.subscribed });
    setAppFeedback(`${message.subscribed ? "Subscribed to" : "Unsubscribed from"} ${message.topic}`);
    setAppFeedbackIsError(false);
  };

  const handleSocketMessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "status") {
      updateStatus(message.status);
      return;
    }

    if (message.type === "error") {
      handleErrorMessage(message);
      return;
    }

    if (message.type === "message") {
      handleBrokerMessage(message);
      return;
    }

    if (message.type === "subscription") {
      handleSubscriptionMessage(message);
    }
  };

  websocketHandlersRef.current = {
    onOpen: () => updateStatus("idle"),
    onClose: () => {
      updateStatus("disconnected");
      if (!stateRef.current.connected) {
        setConnectFeedback("WebSocket disconnected");
        setFeedbackIsError(true);
      }
    },
    onError: () => {
      updateStatus("error");
      if (stateRef.current.connected) {
        setAppFeedback("WebSocket error");
        setAppFeedbackIsError(true);
      } else {
        setConnectFeedback("WebSocket error");
        setFeedbackIsError(true);
      }
    },
    onMessage: handleSocketMessage
  };

  const activeMessages = useMemo(() => messagesForTopic(state), [state]);
  const latestMessages = activeMessages.slice(0, visibleMessages);
  const selectedOutsideLatest = isSelectedMessageOutside(state, latestMessages);
  const visibleHistory = selectedOutsideLatest ? [state.selectedMessage, ...latestMessages] : latestMessages;
  const discoveredTopics = useMemo(() => getDiscoveredTopics(state), [state]);
  const wildcardSubscriptions = state.subscriptions
    .filter((topic) => isWildcardTopic(topic))
    .sort((left, right) => left.localeCompare(right));
  const formattedPayload = state.selectedMessage
    ? formatPayload(state.selectedMessage.payload || "", state.payloadFormat)
    : null;

  const selectTopic = (topic) => {
    dispatch({ type: "topicSelected", topic });
  };

  const toggleTopic = (key) => {
    dispatch({ type: "topicToggled", key });
  };

  const subscribe = (topic, qos) => {
    dispatch({ type: "subscriptionRequested", topic, qos });
    send({ type: "subscribe", topic, qos });
  };

  const unsubscribe = (topic) => {
    send({ type: "unsubscribe", topic });
  };

  const startTopicDiscovery = () => {
    if (state.discovering || state.pendingDiscoveryAction) {
      return;
    }

    dispatch({ type: "discoveryStartRequested" });
    send({ type: "subscribe", topic: "#", qos: 0 });
  };

  const stopTopicDiscovery = () => {
    if (!state.discovering || state.pendingDiscoveryAction) {
      return;
    }

    dispatch({ type: "discoveryStopRequested" });
    send({ type: "unsubscribe", topic: "#" });
  };

  const connect = (event) => {
    event.preventDefault();
    const broker = brokerURLFromForm(new FormData(event.currentTarget));
    const command = {
      type: "connect",
      url: broker.url,
      clean: true
    };
    const autoDiscoveryOnConnect = event.currentTarget.elements.autoDiscovery.checked;

    resetSession();
    dispatch({ type: "connectRequested", broker, command, autoDiscoveryOnConnect });
    send(command);
  };

  const submitSubscription = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("topic") || "").trim();

    if (!topic) {
      return;
    }

    if (topic === "#") {
      startTopicDiscovery();
      event.currentTarget.reset();
      return;
    }

    subscribe(topic, Number(form.get("qos") || 0));
    event.currentTarget.reset();
  };

  const disconnect = () => {
    dispatch({ type: "manualDisconnectRequested" });
    reconnect.stopReconnectLoop();
    send({ type: "disconnect" });
  };

  const setPayloadFormat = (payloadFormat) => {
    dispatch({ type: "payloadFormatChanged", payloadFormat });
  };

  const clearMessages = () => {
    dispatch({ type: "messagesCleared" });
  };

  const selectMessage = (message) => {
    dispatch({ type: "messageSelected", message });
  };

  return {
    state,
    status,
    connectFeedback,
    appFeedback,
    feedbackIsError,
    appFeedbackIsError,
    reconnectMessage: reconnect.reconnectMessage,
    reconnectDetail: reconnect.reconnectDetail,
    activeMessageCount: countMessagesForTopic(state),
    latestMessages,
    visibleHistory,
    selectedOutsideLatest,
    discoveredTopics,
    wildcardSubscriptions,
    formattedPayload,
    actions: {
      attemptReconnect: reconnect.attemptReconnect,
      clearMessages,
      connect,
      disconnect,
      selectMessage,
      selectTopic,
      setPayloadFormat,
      startTopicDiscovery,
      stopTopicDiscovery,
      submitSubscription,
      toggleTopic,
      unsubscribe
    }
  };
};
