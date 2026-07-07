import {
  appendMessageToStore,
  messagesForTopic
} from "../model/messageModel";
import {
  expandTopicAncestors,
  isWildcardTopic,
  messageMatchesTopic,
  unique,
  without
} from "../utils/topic";
import { initialSession } from "../constants/session";

export const getConnectedSession = (state) => ({
  ...state,
  connected: true,
  broker: state.pendingBroker || state.broker,
  pendingBroker: null,
  reconnectActive: false,
  reconnectAttemptInFlight: false,
  reconnectNextAt: null
});

const confirmRestoredSubscription = (state, topic) => {
  const subscriptionQoS = { ...state.subscriptionQoS };

  if (topic === "#") {
    delete subscriptionQoS["#"];
  }

  return {
    ...state,
    restoringTopics: without(state.restoringTopics, topic),
    subscriptions: topic !== "#" ? unique([...state.subscriptions, topic]) : without(state.subscriptions, "#"),
    subscriptionQoS
  };
};

const applyDiscoverySubscription = (state, subscribed) => {
  const subscriptionQoS = { ...state.subscriptionQoS };
  const pendingSubscriptionQoS = { ...state.pendingSubscriptionQoS };
  delete subscriptionQoS["#"];
  delete pendingSubscriptionQoS["#"];

  return {
    ...state,
    subscriptions: without(state.subscriptions, "#"),
    subscriptionQoS,
    discovering: subscribed,
    pendingDiscoveryAction: null,
    pendingSubscriptionQoS
  };
};

const applySubscriptionChange = (state, { topic, subscribed }) => {
  const subscriptionQoS = { ...state.subscriptionQoS };
  const pendingSubscriptionQoS = { ...state.pendingSubscriptionQoS };
  let subscriptions = state.subscriptions;
  let discoveredTopics = state.discoveredTopics;
  let activeTopic = state.activeTopic;
  let selectedMessage = state.selectedMessage;
  let selectedMessageId = state.selectedMessageId;

  if (subscribed) {
    subscriptions = unique([...subscriptions, topic]);
    subscriptionQoS[topic] = pendingSubscriptionQoS[topic] ?? 0;
    delete pendingSubscriptionQoS[topic];

    if (!isWildcardTopic(topic)) {
      discoveredTopics = unique([...discoveredTopics, topic]);
      activeTopic = topic;
      selectedMessage = messagesForTopic({ ...state, activeTopic }, activeTopic)[0] || null;
      selectedMessageId = selectedMessage?.id || null;
    }
  } else {
    subscriptions = without(subscriptions, topic);
    delete subscriptionQoS[topic];
    delete pendingSubscriptionQoS[topic];

    if (activeTopic === topic) {
      activeTopic = "all";
      selectedMessage = messagesForTopic({ ...state, activeTopic }, activeTopic)[0] || null;
      selectedMessageId = selectedMessage?.id || null;
    }
  }

  return {
    ...state,
    subscriptions,
    subscriptionQoS,
    pendingSubscriptionQoS,
    discoveredTopics,
    activeTopic,
    selectedMessage,
    selectedMessageId
  };
};

const addBrokerMessage = (state, message) => {
  const messageStore = appendMessageToStore(state, message);
  const matchesActiveTopic = messageMatchesTopic(state.activeTopic, message);
  const shouldSelect = matchesActiveTopic && (state.autoRotateMessages || !state.selectedMessageId);

  return {
    ...state,
    discoveredTopics: unique([...state.discoveredTopics, message.topic]),
    expandedTopicNodes: expandTopicAncestors(state.expandedTopicNodes, message.topic),
    ...messageStore,
    selectedMessage: shouldSelect ? message : state.selectedMessage,
    selectedMessageId: shouldSelect ? message.id : state.selectedMessageId
  };
};

export const sessionReducer = (state = initialSession, action) => {
  switch (action.type) {
    case "resetSession":
      return {
        ...initialSession,
        lastConnectCommand: state.lastConnectCommand
      };

    case "connectRequested":
      return {
        ...state,
        autoDiscoveryOnConnect: action.autoDiscoveryOnConnect,
        pendingBroker: action.broker,
        lastConnectCommand: action.command
      };

    case "brokerConnected":
      return {
        ...getConnectedSession(state),
        autoDiscoveryOnConnect: false
      };

    case "manualDisconnectCompleted":
      return {
        ...initialSession,
        lastConnectCommand: null
      };

    case "manualDisconnectRequested":
      return {
        ...state,
        manualDisconnecting: true
      };

    case "connectingStatusReceived":
      return {
        ...state,
        reconnectAttemptInFlight: state.reconnectActive ? true : state.reconnectAttemptInFlight
      };

    case "reconnectStarted":
      return {
        ...state,
        reconnectActive: true
      };

    case "reconnectStopped":
      return {
        ...state,
        reconnectActive: false,
        reconnectAttemptInFlight: false,
        reconnectNextAt: null
      };

    case "reconnectScheduled":
      return {
        ...state,
        reconnectNextAt: action.reconnectNextAt,
        reconnectAttemptInFlight: false
      };

    case "reconnectAttemptStarted":
      return {
        ...state,
        reconnectAttemptInFlight: true,
        reconnectNextAt: null
      };

    case "restoreTopicsQueued":
      return {
        ...state,
        restoringTopics: unique([...state.restoringTopics, ...action.topics])
      };

    case "restoreSubscriptionConfirmed":
      return confirmRestoredSubscription(state, action.topic);

    case "discoveryActionFailed":
      return {
        ...state,
        pendingDiscoveryAction: null
      };

    case "discoverySubscriptionChanged":
      return applyDiscoverySubscription(state, action.subscribed);

    case "subscriptionChanged":
      return applySubscriptionChange(state, action);

    case "brokerMessageReceived":
      return addBrokerMessage(state, action.message);

    case "topicSelected": {
      const selectedMessage = messagesForTopic({ ...state, activeTopic: action.topic }, action.topic)[0] || null;
      return {
        ...state,
        activeTopic: action.topic,
        selectedMessage,
        selectedMessageId: selectedMessage?.id || null
      };
    }

    case "topicToggled":
      return {
        ...state,
        expandedTopicNodes: state.expandedTopicNodes.includes(action.key)
          ? without(state.expandedTopicNodes, action.key)
          : [...state.expandedTopicNodes, action.key]
      };

    case "subscriptionRequested":
      return {
        ...state,
        pendingSubscriptionQoS: {
          ...state.pendingSubscriptionQoS,
          [action.topic]: action.qos
        }
      };

    case "discoveryStartRequested":
      return {
        ...state,
        pendingDiscoveryAction: "start",
        pendingSubscriptionQoS: {
          ...state.pendingSubscriptionQoS,
          "#": 0
        }
      };

    case "discoveryStopRequested":
      return {
        ...state,
        pendingDiscoveryAction: "stop"
      };

    case "payloadFormatChanged":
      return {
        ...state,
        payloadFormat: action.payloadFormat
      };

    case "messageAutoRotateToggled": {
      const selectedMessage = action.enabled ? messagesForTopic(state)[0] || null : state.selectedMessage;

      return {
        ...state,
        autoRotateMessages: action.enabled,
        selectedMessage,
        selectedMessageId: action.enabled ? selectedMessage?.id || null : state.selectedMessageId
      };
    }

    case "messagesCleared":
      return {
        ...state,
        messageCountsByTopic: {},
        messages: [],
        messagesByTopic: {},
        selectedMessageId: null,
        selectedMessage: null,
        totalMessageCount: 0
      };

    case "messageSelected":
      return {
        ...state,
        autoRotateMessages: false,
        selectedMessage: action.message,
        selectedMessageId: action.message.id
      };

    default:
      return state;
  }
};
