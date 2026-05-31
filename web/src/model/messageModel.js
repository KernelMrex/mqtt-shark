import { maxHistory } from "../constants/session";
import { isWildcardTopic, messageMatchesTopic, mqttTopicMatches } from "../utils/topic";

export const appendMessageToStore = (state, message) => {
  const messages = [message, ...state.messages].slice(0, maxHistory);
  const messagesByTopic = {
    ...state.messagesByTopic,
    [message.topic]: [message, ...(state.messagesByTopic[message.topic] || [])].slice(0, maxHistory)
  };
  const messageCountsByTopic = {
    ...state.messageCountsByTopic,
    [message.topic]: (state.messageCountsByTopic[message.topic] || 0) + 1
  };

  return {
    messageCountsByTopic,
    messages,
    messagesByTopic,
    totalMessageCount: state.totalMessageCount + 1
  };
};

export const messagesForTopic = (state, topic = state.activeTopic) => {
  if (topic === "all") {
    return state.messages;
  }

  if (!isWildcardTopic(topic)) {
    return state.messagesByTopic[topic] || [];
  }

  return Object.entries(state.messagesByTopic)
    .filter(([knownTopic]) => mqttTopicMatches(topic, knownTopic))
    .flatMap(([, messages]) => messages)
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
    .slice(0, maxHistory);
};

export const countMessagesForTopic = (state, topic = state.activeTopic) => {
  if (topic === "all") {
    return state.totalMessageCount;
  }

  if (isWildcardTopic(topic)) {
    return Object.entries(state.messageCountsByTopic).reduce((total, [knownTopic, count]) => {
      return mqttTopicMatches(topic, knownTopic) ? total + count : total;
    }, 0);
  }

  return state.messageCountsByTopic[topic] || 0;
};

export const isSelectedMessageOutside = (state, visibleMessages) => {
  return Boolean(
    state.selectedMessage
      && messageMatchesTopic(state.activeTopic, state.selectedMessage)
      && !visibleMessages.some((message) => message.id === state.selectedMessage.id)
  );
};
