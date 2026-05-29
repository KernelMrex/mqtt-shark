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
const historyMeta = document.querySelector("#history-meta");

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);

const state = {
  connected: false,
  broker: null,
  pendingBroker: null,
  activeTopic: "all",
  selectedMessageId: null,
  subscriptions: new Set(),
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
  state.subscriptions.clear();
  state.messages = [];
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
  if (state.activeTopic === "all") {
    return state.messages;
  }

  return state.messages.filter((message) => message.topic === state.activeTopic);
};

const getKnownTopics = () => {
  const topics = new Map();

  for (const topic of state.subscriptions) {
    topics.set(topic, { topic, count: 0, subscribed: true });
  }

  for (const message of state.messages) {
    const existing = topics.get(message.topic) || {
      topic: message.topic,
      count: 0,
      subscribed: state.subscriptions.has(message.topic)
    };
    existing.count += 1;
    topics.set(message.topic, existing);
  }

  return [...topics.values()].sort((left, right) => left.topic.localeCompare(right.topic));
};

const renderTopics = () => {
  topicsListElement.replaceChildren();

  const allItem = createTopicItem({
    topic: "all",
    label: "All topics",
    count: state.messages.length,
    subscribed: false
  });
  topicsListElement.append(allItem);

  for (const topic of getKnownTopics()) {
    topicsListElement.append(createTopicItem(topic));
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
    state.activeTopic = topic;
    const latest = messagesForActiveTopic()[0] || null;
    state.selectedMessageId = latest?.id || null;
    renderTopics();
    renderMessages();
    renderPayload(latest);
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

const renderMessages = () => {
  messagesElement.replaceChildren();

  const messages = messagesForActiveTopic().slice(0, visibleMessages);
  const visibleCount = messages.length;
  historyMeta.textContent = `${visibleCount} of latest ${visibleMessages} shown`;

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No messages yet";
    messagesElement.append(empty);
    return;
  }

  for (const message of messages) {
    messagesElement.append(createMessageCard(message));
  }
};

const createMessageCard = (message) => {
  const item = document.createElement("article");
  const button = document.createElement("button");
  const meta = document.createElement("div");
  const topic = document.createElement("span");
  const time = document.createElement("span");
  const preview = document.createElement("p");

  item.className = "message-card";
  button.type = "button";
  button.className = "message-button";
  button.classList.toggle("is-active", message.id === state.selectedMessageId);
  button.addEventListener("click", () => {
    state.selectedMessageId = message.id;
    renderMessages();
    renderPayload(message);
  });

  meta.className = "message-meta";
  topic.className = "message-topic";
  topic.textContent = message.topic;
  time.textContent = `${new Date(message.receivedAt).toLocaleTimeString()} · QoS ${message.qos}${message.retain ? " · retained" : ""}`;
  preview.className = "message-preview";
  preview.textContent = message.payload || "(empty payload)";

  meta.append(topic, time);
  button.append(meta, preview);
  item.append(button);
  return item;
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

  payloadMeta.hidden = false;
  payloadEmpty.hidden = true;
  payloadViewer.hidden = false;
  payloadMeta.replaceChildren(
    createMetaItem("Topic", message.topic),
    createMetaItem("Received", new Date(message.receivedAt).toLocaleString()),
    createMetaItem("QoS", String(message.qos)),
    createMetaItem("Retain", message.retain ? "Yes" : "No"),
    createMetaItem("Payload", `${payloadSize} B`)
  );
  payloadViewer.textContent = message.payload || "(empty payload)";
};

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

  const shouldSelect = !state.selectedMessageId || state.activeTopic === topic || state.activeTopic === "all";
  if (shouldSelect) {
    state.selectedMessageId = message.id;
    renderPayload(message);
  }

  renderTopics();
  renderMessages();
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
    if (message.subscribed) {
      state.subscriptions.add(message.topic);
      state.activeTopic = message.topic;
      showAppFeedback(`Subscribed to ${message.topic}`);
    } else {
      state.subscriptions.delete(message.topic);
      if (state.activeTopic === message.topic) {
        state.activeTopic = "all";
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

  send({
    type: "subscribe",
    topic: topicInput.value,
    qos: Number(document.querySelector("#subscribe-qos").value)
  });

  topicInput.value = "";
});

document.querySelector("#clear-messages").addEventListener("click", () => {
  state.messages = [];
  state.selectedMessageId = null;
  renderTopics();
  renderMessages();
  renderPayload(null);
});

renderTopics();
renderMessages();
loadAppInfo();
