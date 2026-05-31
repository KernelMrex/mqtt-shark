export const unique = (items) => [...new Set(items)];

export const without = (items, item) => items.filter((value) => value !== item);

export const isWildcardTopic = (topic) => topic.includes("#") || topic.includes("+");

export const mqttTopicMatches = (filter, topic) => {
  const filterSegments = filter.split("/");
  const topicSegments = topic.split("/");

  for (let index = 0; index < filterSegments.length; index += 1) {
    const segment = filterSegments[index];

    if (segment === "#") {
      return index === filterSegments.length - 1;
    }

    if (index >= topicSegments.length) {
      return false;
    }

    if (segment !== "+" && segment !== topicSegments[index]) {
      return false;
    }
  }

  return filterSegments.length === topicSegments.length;
};

export const messageMatchesTopic = (activeTopic, message) => {
  if (activeTopic === "all") {
    return true;
  }

  if (isWildcardTopic(activeTopic)) {
    return mqttTopicMatches(activeTopic, message.topic);
  }

  return message.topic === activeTopic;
};

export const expandTopicAncestors = (expandedTopicNodes, topic) => {
  const segments = topic.split("/");
  const nodes = [...expandedTopicNodes];

  for (let index = 0; index < segments.length - 1; index += 1) {
    nodes.push(segments.slice(0, index + 1).join("\u001f"));
  }

  return unique(nodes);
};

export const getDiscoveredTopics = (state) => {
  const topics = new Map();

  for (const topic of state.discoveredTopics) {
    topics.set(topic, {
      topic,
      count: state.messageCountsByTopic[topic] || 0,
      subscribed: state.subscriptions.includes(topic)
    });
  }

  for (const topic of state.subscriptions) {
    if (isWildcardTopic(topic)) {
      continue;
    }

    topics.set(topic, {
      topic,
      count: state.messageCountsByTopic[topic] || 0,
      subscribed: true
    });
  }

  return [...topics.values()].sort((left, right) => left.topic.localeCompare(right.topic));
};

export const sortTopicNodes = (children) => {
  return [...children.values()].sort((left, right) => left.label.localeCompare(right.label));
};

export const buildTopicTree = (topics) => {
  const root = { children: new Map() };

  for (const topic of topics) {
    const segments = topic.topic.split("/");
    let current = root;

    segments.forEach((segment, index) => {
      const key = segments.slice(0, index + 1).join("\u001f");
      const path = segments.slice(0, index + 1).join("/");
      const child = current.children.get(segment) || {
        key,
        label: segment || "(empty)",
        path,
        topic: path,
        count: 0,
        aggregateCount: 0,
        subscribed: false,
        hasTopic: false,
        children: new Map()
      };

      child.aggregateCount += topic.count;
      current.children.set(segment, child);
      current = child;
    });

    current.count = topic.count;
    current.subscribed = topic.subscribed;
    current.hasTopic = true;
  }

  return sortTopicNodes(root.children);
};
