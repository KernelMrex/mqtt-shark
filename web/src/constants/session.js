export const maxHistory = 20;
export const visibleMessages = maxHistory;

export const initialSession = {
  connected: false,
  broker: null,
  pendingBroker: null,
  lastConnectCommand: null,
  reconnectActive: false,
  reconnectAttemptInFlight: false,
  reconnectNextAt: null,
  manualDisconnecting: false,
  autoDiscoveryOnConnect: false,
  activeTopic: "all",
  payloadFormat: "auto",
  selectedMessageId: null,
  selectedMessage: null,
  discovering: false,
  pendingDiscoveryAction: null,
  subscriptions: [],
  subscriptionQoS: {},
  pendingSubscriptionQoS: {},
  restoringTopics: [],
  discoveredTopics: [],
  expandedTopicNodes: [],
  messageCountsByTopic: {},
  totalMessageCount: 0,
  messages: [],
  messagesByTopic: {}
};
