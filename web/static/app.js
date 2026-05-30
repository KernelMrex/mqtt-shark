const connectScreen = document.querySelector("#connect-screen");
const appShell = document.querySelector("#app-shell");
const statusElement = document.querySelector("#status");
const messagesElement = document.querySelector("#messages");
const topicsListElement = document.querySelector("#topics-list");
const connectionForm = document.querySelector("#connection-form");
const subscribeForm = document.querySelector("#subscribe-form");
const appVersionElement = document.querySelector("#app-version");
const connectButton = document.querySelector("#connect-button");
const connectFeedback = document.querySelector("#connect-feedback");
const appFeedback = document.querySelector("#app-feedback");
const brokerTitle = document.querySelector("#broker-title");
const payloadViewer = document.querySelector("#payload-viewer");
const payloadMeta = document.querySelector("#payload-meta");
const payloadEmpty = document.querySelector("#payload-empty");
const payloadFormatElement = document.querySelector("#payload-format");
const historyMeta = document.querySelector("#history-meta");
const discoverTopicsButton = document.querySelector("#discover-topics");

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);

const state = {
  connected: false,
  broker: null,
  pendingBroker: null,
  activeTopic: "all",
  payloadFormat: "auto",
  selectedMessageId: null,
  selectedMessage: null,
  discovering: false,
  pendingDiscoveryAction: null,
  subscriptions: new Set(),
  discoveredTopics: new Set(),
  expandedTopicNodes: new Set(),
  messages: []
};

const maxHistory = 500;
const visibleMessages = 20;

const loadAppInfo = async () => {
  try {
    const response = await fetch("/api/info");
    if (!response.ok) {
      return;
    }

    const info = await response.json();
    appVersionElement.textContent = `v${info.version}`;
  } catch {
    appVersionElement.textContent = "dev";
  }
};

const send = (message) => {
  if (socket.readyState !== WebSocket.OPEN) {
    showConnectFeedback("WebSocket is not connected", true);
    return;
  }

  socket.send(JSON.stringify(message));
};

const showConnectFeedback = (message, isError = false) => {
  connectFeedback.textContent = message;
  connectFeedback.classList.toggle("feedback-error", isError);
};

const showAppFeedback = (message, isError = false) => {
  appFeedback.textContent = message;
  appFeedback.classList.toggle("feedback-error", isError);
};

const setStatus = (status) => {
  statusElement.textContent = status;
  statusElement.className = `status status-${status}`;

  if (status === "connecting") {
    connectButton.disabled = true;
    showConnectFeedback("Connecting...");
    return;
  }

  connectButton.disabled = false;

  if (status === "connected") {
    openBrokerPanel();
    return;
  }

  if (status === "disconnected" && state.connected) {
    closeBrokerPanel("Disconnected from broker");
  }
};

const brokerURLFromForm = (form) => {
  const host = String(form.get("host") || "").trim();
  const port = String(form.get("port") || "1883").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(host);
  const url = hasScheme ? host : `mqtt://${host}:${port}`;

  return { host, port, url };
};

const resetSession = () => {
  state.activeTopic = "all";
  state.selectedMessageId = null;
  state.selectedMessage = null;
  state.discovering = false;
  state.pendingDiscoveryAction = null;
  state.subscriptions.clear();
  state.discoveredTopics.clear();
  state.expandedTopicNodes.clear();
  state.messages = [];
  updateDiscoverButton();
  renderTopics();
  renderMessages();
  renderPayload(null);
};

const openBrokerPanel = () => {
  state.connected = true;
  state.broker = state.pendingBroker;
  state.pendingBroker = null;

  brokerTitle.textContent = `${state.broker.host}:${state.broker.port}`;
  connectScreen.hidden = true;
  appShell.hidden = false;
  showConnectFeedback("");
  showAppFeedback("");
};

const closeBrokerPanel = (message = "") => {
  state.connected = false;
  state.broker = null;
  state.pendingBroker = null;
  resetSession();
  appShell.hidden = true;
  connectScreen.hidden = false;
  showConnectFeedback(message, Boolean(message));
};

const messagesForActiveTopic = () => {
  return state.messages.filter((message) => messageMatchesActiveTopic(message));
};

const messageMatchesActiveTopic = (message) => {
  if (state.activeTopic === "all") {
    return true;
  }

  if (isWildcardTopic(state.activeTopic)) {
    return mqttTopicMatches(state.activeTopic, message.topic);
  }

  return message.topic === state.activeTopic;
};

const mqttTopicMatches = (filter, topic) => {
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

const getMessageCountsByTopic = () => {
  const topics = new Map();

  for (const message of state.messages) {
    topics.set(message.topic, (topics.get(message.topic) || 0) + 1);
  }

  return topics;
};

const isWildcardTopic = (topic) => topic.includes("#") || topic.includes("+");

const getDiscoveredTopics = () => {
  const messageCounts = getMessageCountsByTopic();
  const topics = new Map();

  for (const topic of state.discoveredTopics) {
    topics.set(topic, {
      topic,
      count: messageCounts.get(topic) || 0,
      subscribed: state.subscriptions.has(topic)
    });
  }

  for (const topic of state.subscriptions) {
    if (isWildcardTopic(topic)) {
      continue;
    }

    topics.set(topic, {
      topic,
      count: messageCounts.get(topic) || 0,
      subscribed: true
    });
  }

  return [...topics.values()].sort((left, right) => left.topic.localeCompare(right.topic));
};

const getWildcardSubscriptions = () => [...state.subscriptions]
  .filter((topic) => isWildcardTopic(topic))
  .sort((left, right) => left.localeCompare(right));

const messagesForFilter = (filter) => state.messages.filter((message) => mqttTopicMatches(filter, message.topic));

const renderTopics = () => {
  topicsListElement.replaceChildren();

  const allItem = createTopicItem({
    topic: "all",
    label: "All topics",
    count: state.messages.length,
    subscribed: false
  });
  topicsListElement.append(allItem);

  for (const topic of getWildcardSubscriptions()) {
    topicsListElement.append(createTopicItem({
      topic,
      label: `Filter: ${topic}`,
      count: messagesForFilter(topic).length,
      subscribed: true
    }));
  }

  const topics = getDiscoveredTopics();
  if (topics.length === 0) {
    const empty = document.createElement("li");
    empty.className = "topics-empty";
    empty.textContent = state.discovering ? "Waiting for broker messages" : "Start discovery to observe topics";
    topicsListElement.append(empty);
    return;
  }

  for (const node of buildTopicTree(topics)) {
    topicsListElement.append(createTopicTreeItem(node, 0));
  }
};

const createTopicItem = ({ topic, label = topic, count, subscribed }) => {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const name = document.createElement("span");
  const meta = document.createElement("span");

  button.type = "button";
  button.className = "topic-button";
  button.classList.toggle("is-active", state.activeTopic === topic);
  button.addEventListener("click", () => {
    selectTopic(topic);
  });

  name.className = "topic-name";
  name.textContent = label;
  meta.className = "topic-meta";
  meta.textContent = subscribed ? `${count} msg · subscribed` : `${count} msg`;

  button.append(name, meta);

  if (topic !== "all" && subscribed) {
    const unsubscribe = document.createElement("button");
    unsubscribe.type = "button";
    unsubscribe.className = "topic-remove";
    unsubscribe.textContent = "×";
    unsubscribe.title = `Unsubscribe from ${topic}`;
    unsubscribe.addEventListener("click", (event) => {
      event.stopPropagation();
      send({ type: "unsubscribe", topic });
    });
    button.append(unsubscribe);
  }

  item.append(button);
  return item;
};

const buildTopicTree = (topics) => {
  const root = { children: new Map() };

  for (const topic of topics) {
    const segments = topic.topic.split("/");
    let current = root;

    segments.forEach((segment, index) => {
      const key = segments.slice(0, index + 1).join("\u001f");
      const path = segments.slice(0, index + 1).join("/");
      const existing = current.children.get(segment);
      const child = existing || {
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

const sortTopicNodes = (children) => [...children.values()].sort((left, right) => left.label.localeCompare(right.label));

const createTopicTreeItem = (node, depth) => {
  const item = document.createElement("li");
  const row = document.createElement("div");
  const toggle = document.createElement("button");
  const label = document.createElement("button");
  const name = document.createElement("span");
  const meta = document.createElement("span");
  const hasChildren = node.children.size > 0;
  const isExpanded = state.expandedTopicNodes.has(node.key);

  item.className = "topic-tree-item";
  row.className = "topic-tree-row";
  row.style.setProperty("--topic-depth", String(depth));

  toggle.type = "button";
  toggle.className = "topic-toggle";
  toggle.textContent = hasChildren ? (isExpanded ? "▾" : "▸") : "";
  toggle.disabled = !hasChildren;
  toggle.title = hasChildren ? `${isExpanded ? "Collapse" : "Expand"} ${node.path}` : "";
  toggle.addEventListener("click", () => {
    if (isExpanded) {
      state.expandedTopicNodes.delete(node.key);
    } else {
      state.expandedTopicNodes.add(node.key);
    }
    renderTopics();
  });

  label.type = "button";
  label.className = "topic-node-button";
  label.classList.toggle("is-active", state.activeTopic === node.topic);
  label.disabled = !node.hasTopic;
  label.addEventListener("click", () => {
    if (node.hasTopic) {
      selectTopic(node.topic);
    }
  });

  name.className = "topic-name";
  name.textContent = node.label;
  meta.className = "topic-meta";
  meta.textContent = node.subscribed ? `${node.count} msg · subscribed` : `${node.count} msg`;

  label.append(name, meta);
  row.append(toggle, label);

  if (node.subscribed) {
    const unsubscribe = document.createElement("button");
    unsubscribe.type = "button";
    unsubscribe.className = "topic-remove";
    unsubscribe.textContent = "×";
    unsubscribe.title = `Unsubscribe from ${node.topic}`;
    unsubscribe.addEventListener("click", () => {
      send({ type: "unsubscribe", topic: node.topic });
    });
    row.append(unsubscribe);
  }

  item.append(row);

  if (hasChildren && isExpanded) {
    const children = document.createElement("ul");
    children.className = "topic-tree-children";
    for (const child of sortTopicNodes(node.children)) {
      children.append(createTopicTreeItem(child, depth + 1));
    }
    item.append(children);
  }

  return item;
};

const selectTopic = (topic) => {
  state.activeTopic = topic;
  selectMessage(messagesForActiveTopic()[0] || null);
  renderTopics();
  renderMessages();
};

const updateDiscoverButton = () => {
  discoverTopicsButton.disabled = Boolean(state.pendingDiscoveryAction);
  discoverTopicsButton.textContent = state.discovering ? "Stop" : "Discover";
  discoverTopicsButton.classList.toggle("is-active", state.discovering);
};

const renderMessages = () => {
  messagesElement.replaceChildren();

  const latestMessages = messagesForActiveTopic().slice(0, visibleMessages);
  const selectedOutsideLatest = state.selectedMessage
    && messageMatchesActiveTopic(state.selectedMessage)
    && !latestMessages.some((message) => message.id === state.selectedMessage.id);
  const messages = selectedOutsideLatest ? [state.selectedMessage, ...latestMessages] : latestMessages;
  const visibleCount = latestMessages.length;
  historyMeta.textContent = selectedOutsideLatest
    ? `Selected + ${visibleCount} of latest ${visibleMessages} shown`
    : `${visibleCount} of latest ${visibleMessages} shown`;

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No messages yet";
    messagesElement.append(empty);
    return;
  }

  for (const message of messages) {
    messagesElement.append(createMessageCard(message, {
      pinned: selectedOutsideLatest && message.id === state.selectedMessage.id
    }));
  }
};

const createMessageCard = (message, { pinned = false } = {}) => {
  const item = document.createElement("article");
  const button = document.createElement("button");
  const meta = document.createElement("div");
  const topic = document.createElement("span");
  const time = document.createElement("span");
  const preview = document.createElement("p");

  item.className = "message-card";
  item.classList.toggle("is-pinned", pinned);
  button.type = "button";
  button.className = "message-button";
  button.classList.toggle("is-active", message.id === state.selectedMessageId);
  button.addEventListener("click", () => {
    selectMessage(message);
    renderMessages();
  });

  meta.className = "message-meta";
  topic.className = "message-topic";
  topic.textContent = message.topic;
  time.textContent = `${pinned ? "selected · " : ""}${new Date(message.receivedAt).toLocaleTimeString()} · QoS ${message.qos}${message.retain ? " · retained" : ""}`;
  preview.className = "message-preview";
  preview.textContent = message.payload || "(empty payload)";

  meta.append(topic, time);
  button.append(meta, preview);
  item.append(button);
  return item;
};

const selectMessage = (message) => {
  state.selectedMessage = message;
  state.selectedMessageId = message?.id || null;
  renderPayload(message);
};

const renderPayload = (message) => {
  if (!message) {
    payloadMeta.hidden = true;
    payloadEmpty.hidden = false;
    payloadViewer.hidden = true;
    payloadViewer.textContent = "";
    return;
  }

  const payloadSize = new Blob([message.payload || ""]).size;
  const formatted = formatPayload(message.payload || "", state.payloadFormat);

  payloadMeta.hidden = false;
  payloadEmpty.hidden = true;
  payloadViewer.hidden = false;
  payloadMeta.replaceChildren(
    createMetaItem("Topic", message.topic),
    createMetaItem("Received", new Date(message.receivedAt).toLocaleString()),
    createMetaItem("QoS", String(message.qos)),
    createMetaItem("Retain", message.retain ? "Yes" : "No"),
    createMetaItem("Payload", `${payloadSize} B`),
    createMetaItem("Format", formatted.label)
  );
  payloadViewer.textContent = formatted.body;
};

const formatPayload = (payload, requestedFormat) => {
  if (payload === "") {
    return { label: formatLabel(requestedFormat), body: "(empty payload)" };
  }

  if (requestedFormat === "auto") {
    return formatPayload(payload, detectPayloadFormat(payload));
  }

  if (requestedFormat === "json") {
    return formatJSONPayload(payload);
  }

  if (requestedFormat === "xml") {
    return formatXMLPayload(payload);
  }

  if (requestedFormat === "binary") {
    return {
      label: "Binary",
      body: formatBinaryPayload(payload)
    };
  }

  if (requestedFormat === "base64") {
    return {
      label: "Base64",
      body: bytesToBase64(payloadBytes(payload))
    };
  }

  return {
    label: "Text",
    body: payload
  };
};

const detectPayloadFormat = (payload) => {
  const trimmed = payload.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(payload);
      return "json";
    } catch {
      return hasBinaryMarkers(payload) ? "binary" : "text";
    }
  }

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    const document = new DOMParser().parseFromString(payload, "application/xml");
    if (!document.querySelector("parsererror")) {
      return "xml";
    }
  }

  return hasBinaryMarkers(payload) ? "binary" : "text";
};

const hasBinaryMarkers = (payload) => {
  for (const character of payload) {
    const code = character.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }

  return false;
};

const formatJSONPayload = (payload) => {
  try {
    return {
      label: "JSON",
      body: JSON.stringify(JSON.parse(payload), null, 2)
    };
  } catch (error) {
    return {
      label: "JSON invalid",
      body: `Invalid JSON: ${error.message}\n\n${payload}`
    };
  }
};

const formatXMLPayload = (payload) => {
  const document = new DOMParser().parseFromString(payload, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return {
      label: "XML invalid",
      body: `Invalid XML\n\n${payload}`
    };
  }

  return {
    label: "XML",
    body: prettyPrintXML(new XMLSerializer().serializeToString(document))
  };
};

const prettyPrintXML = (xml) => {
  const lines = xml.replace(/>\s*</g, ">\n<").split("\n");
  let depth = 0;

  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^<\/[^>]+>/.test(trimmed)) {
      depth = Math.max(depth - 1, 0);
    }

    const output = `${"  ".repeat(depth)}${trimmed}`;

    if (/^<[^!?/][^>]*[^/]>(?!.*<\/[^>]+>$)/.test(trimmed)) {
      depth += 1;
    }

    return output;
  }).join("\n");
};

const formatBinaryPayload = (payload) => {
  const bytes = payloadBytes(payload);

  if (bytes.length === 0) {
    return "(empty payload)";
  }

  const rows = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = [...chunk].map((byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
    const ascii = [...chunk].map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");

    rows.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }

  return rows.join("\n");
};

const payloadBytes = (payload) => new TextEncoder().encode(payload);

const bytesToBase64 = (bytes) => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const formatLabel = (format) => ({
  auto: "Auto",
  text: "Text",
  json: "JSON",
  xml: "XML",
  binary: "Binary",
  base64: "Base64"
})[format] || "Text";

const createMetaItem = (label, value) => {
  const item = document.createElement("span");
  const labelElement = document.createElement("strong");
  const valueElement = document.createElement("span");

  labelElement.textContent = label;
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  return item;
};

const addBrokerMessage = ({ topic, payload, qos, retain, receivedAt }) => {
  state.discoveredTopics.add(topic);
  expandTopicAncestors(topic);

  const message = {
    id: crypto.randomUUID(),
    topic,
    payload,
    qos,
    retain,
    receivedAt
  };

  state.messages.unshift(message);
  state.messages = state.messages.slice(0, maxHistory);

  if (!state.selectedMessageId && messageMatchesActiveTopic(message)) {
    selectMessage(message);
  }

  renderTopics();
  renderMessages();
};

const expandTopicAncestors = (topic) => {
  const segments = topic.split("/");

  for (let index = 0; index < segments.length - 1; index += 1) {
    state.expandedTopicNodes.add(segments.slice(0, index + 1).join("\u001f"));
  }
};

socket.addEventListener("open", () => setStatus("idle"));
socket.addEventListener("close", () => {
  setStatus("disconnected");
  if (!state.connected) {
    showConnectFeedback("WebSocket disconnected", true);
  }
});
socket.addEventListener("error", () => {
  setStatus("error");
  if (state.connected) {
    showAppFeedback("WebSocket error", true);
  } else {
    showConnectFeedback("WebSocket error", true);
  }
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "status") {
    setStatus(message.status);
    return;
  }

  if (message.type === "error") {
    if (state.pendingDiscoveryAction) {
      state.pendingDiscoveryAction = null;
      updateDiscoverButton();
    }

    setStatus("error");
    if (state.connected) {
      showAppFeedback(message.message, true);
    } else {
      showConnectFeedback(message.message, true);
    }
    return;
  }

  if (message.type === "message") {
    showAppFeedback("");
    addBrokerMessage(message);
    return;
  }

  if (message.type === "subscription") {
    if (message.topic === "#" && state.pendingDiscoveryAction) {
      state.discovering = message.subscribed;
      state.pendingDiscoveryAction = null;
      updateDiscoverButton();
      showAppFeedback(message.subscribed ? "Discovering topics through #" : "Stopped topic discovery");
      renderTopics();
      return;
    }

    if (message.subscribed) {
      state.subscriptions.add(message.topic);
      if (!isWildcardTopic(message.topic)) {
        state.discoveredTopics.add(message.topic);
        state.activeTopic = message.topic;
        selectMessage(messagesForActiveTopic()[0] || null);
      }
      showAppFeedback(`Subscribed to ${message.topic}`);
    } else {
      state.subscriptions.delete(message.topic);
      if (state.activeTopic === message.topic) {
        state.activeTopic = "all";
        selectMessage(messagesForActiveTopic()[0] || null);
      }
      showAppFeedback(`Unsubscribed from ${message.topic}`);
    }

    renderTopics();
    renderMessages();
  }
});

connectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(connectionForm);
  const broker = brokerURLFromForm(form);

  resetSession();
  state.pendingBroker = broker;
  send({
    type: "connect",
    url: broker.url,
    clean: true
  });
});

document.querySelector("#disconnect").addEventListener("click", () => {
  send({ type: "disconnect" });
});

subscribeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const topicInput = document.querySelector("#subscribe-topic");
  const topic = topicInput.value.trim();

  if (topic === "#") {
    startTopicDiscovery();
    topicInput.value = "";
    return;
  }

  send({
    type: "subscribe",
    topic,
    qos: Number(document.querySelector("#subscribe-qos").value)
  });

  topicInput.value = "";
});

const startTopicDiscovery = () => {
  if (state.discovering || state.pendingDiscoveryAction) {
    return;
  }

  state.pendingDiscoveryAction = "start";
  updateDiscoverButton();
  send({
    type: "subscribe",
    topic: "#",
    qos: 0
  });
};

const stopTopicDiscovery = () => {
  if (!state.discovering || state.pendingDiscoveryAction) {
    return;
  }

  state.pendingDiscoveryAction = "stop";
  updateDiscoverButton();
  send({
    type: "unsubscribe",
    topic: "#"
  });
};

discoverTopicsButton.addEventListener("click", () => {
  if (state.discovering) {
    stopTopicDiscovery();
  } else {
    startTopicDiscovery();
  }
});

payloadFormatElement.addEventListener("change", () => {
  state.payloadFormat = payloadFormatElement.value;
  renderPayload(state.selectedMessage);
});

document.querySelector("#clear-messages").addEventListener("click", () => {
  state.messages = [];
  state.selectedMessageId = null;
  state.selectedMessage = null;
  renderTopics();
  renderMessages();
  renderPayload(null);
});

updateDiscoverButton();
renderTopics();
renderMessages();
loadAppInfo();
