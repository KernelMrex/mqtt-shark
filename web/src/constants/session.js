export const maxHistory = 500;
export const visibleMessages = 20;

export const initialSession = {
  connected: false,
  broker: null,
  pendingBroker: null,
  lastConnectCommand: null,
  reconnectActive: false,
  reconnectAttemptInFlight: false,
  reconnectNextAt: null,
  manualDisconnecting: false,
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
  messages: []
};
