import { useEffect, useMemo, useRef, useState } from "react";

const maxHistory = 500;
const visibleMessages = 20;

const initialSession = {
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

const unique = (items) => [...new Set(items)];
const without = (items, item) => items.filter((value) => value !== item);
const isWildcardTopic = (topic) => topic.includes("#") || topic.includes("+");
let messageIdCounter = 0;

const createMessageId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  messageIdCounter += 1;
  return `${Date.now()}-${messageIdCounter}-${Math.random().toString(36).slice(2)}`;
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

const messageMatchesTopic = (activeTopic, message) => {
  if (activeTopic === "all") {
    return true;
  }

  if (isWildcardTopic(activeTopic)) {
    return mqttTopicMatches(activeTopic, message.topic);
  }

  return message.topic === activeTopic;
};

const messagesForTopic = (state, topic = state.activeTopic) => {
  return state.messages.filter((message) => messageMatchesTopic(topic, message));
};

const expandTopicAncestors = (expandedTopicNodes, topic) => {
  const segments = topic.split("/");
  const nodes = [...expandedTopicNodes];

  for (let index = 0; index < segments.length - 1; index += 1) {
    nodes.push(segments.slice(0, index + 1).join("\u001f"));
  }

  return unique(nodes);
};

const getMessageCountsByTopic = (messages) => {
  const topics = new Map();

  for (const message of messages) {
    topics.set(message.topic, (topics.get(message.topic) || 0) + 1);
  }

  return topics;
};

const getDiscoveredTopics = (state) => {
  const messageCounts = getMessageCountsByTopic(state.messages);
  const topics = new Map();

  for (const topic of state.discoveredTopics) {
    topics.set(topic, {
      topic,
      count: messageCounts.get(topic) || 0,
      subscribed: state.subscriptions.includes(topic)
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

const sortTopicNodes = (children) => [...children.values()].sort((left, right) => left.label.localeCompare(right.label));

const buildTopicTree = (topics) => {
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

const brokerURLFromForm = (form) => {
  const host = String(form.get("host") || "").trim();
  const port = String(form.get("port") || "1883").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(host);
  const url = hasScheme ? host : `mqtt://${host}:${port}`;

  return { host, port, url };
};

const formatLabel = (format) => ({
  auto: "Auto",
  text: "Text",
  json: "JSON",
  xml: "XML",
  binary: "Binary",
  base64: "Base64"
})[format] || "Text";

const payloadBytes = (payload) => new TextEncoder().encode(payload);

const bytesToBase64 = (bytes) => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
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

const MetaItem = ({ label, value }) => (
  <span>
    <strong>{label}</strong>
    <span>{value}</span>
  </span>
);

const TopicButton = ({ topic, label = topic, count, subscribed, activeTopic, onSelect, onUnsubscribe }) => (
  <li>
    <button
      type="button"
      className={`topic-button${activeTopic === topic ? " is-active" : ""}`}
      onClick={() => onSelect(topic)}
    >
      <span className="topic-name">{label}</span>
      <span className="topic-meta">{subscribed ? `${count} msg · subscribed` : `${count} msg`}</span>
      {topic !== "all" && subscribed ? (
        <span
          role="button"
          tabIndex={0}
          className="topic-remove"
          title={`Unsubscribe from ${topic}`}
          onClick={(event) => {
            event.stopPropagation();
            onUnsubscribe(topic);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onUnsubscribe(topic);
            }
          }}
        >
          ×
        </span>
      ) : null}
    </button>
  </li>
);

const TopicTreeItem = ({ node, depth, state, onToggle, onSelect, onUnsubscribe }) => {
  const hasChildren = node.children.size > 0;
  const isExpanded = state.expandedTopicNodes.includes(node.key);

  return (
    <li className="topic-tree-item">
      <div className="topic-tree-row" style={{ "--topic-depth": String(depth) }}>
        <button
          type="button"
          className="topic-toggle"
          disabled={!hasChildren}
          title={hasChildren ? `${isExpanded ? "Collapse" : "Expand"} ${node.path}` : ""}
          onClick={() => onToggle(node.key)}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </button>
        <button
          type="button"
          className={`topic-node-button${state.activeTopic === node.topic ? " is-active" : ""}`}
          disabled={!node.hasTopic}
          onClick={() => {
            if (node.hasTopic) {
              onSelect(node.topic);
            }
          }}
        >
          <span className="topic-name">{node.label}</span>
          <span className="topic-meta">{node.subscribed ? `${node.count} msg · subscribed` : `${node.count} msg`}</span>
        </button>
        {node.subscribed ? (
          <button
            type="button"
            className="topic-remove"
            title={`Unsubscribe from ${node.topic}`}
            onClick={() => onUnsubscribe(node.topic)}
          >
            ×
          </button>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <ul className="topic-tree-children">
          {sortTopicNodes(node.children).map((child) => (
            <TopicTreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              state={state}
              onToggle={onToggle}
              onSelect={onSelect}
              onUnsubscribe={onUnsubscribe}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

const MessageCard = ({ message, selected, pinned, onSelect }) => (
  <article className={`message-card${pinned ? " is-pinned" : ""}`}>
    <button
      type="button"
      className={`message-button${selected ? " is-active" : ""}`}
      onClick={() => onSelect(message)}
    >
      <div className="message-meta">
        <span className="message-topic">{message.topic}</span>
        <span>
          {pinned ? "selected · " : ""}
          {new Date(message.receivedAt).toLocaleTimeString()} · QoS {message.qos}
          {message.retain ? " · retained" : ""}
        </span>
      </div>
      <p className="message-preview">{message.payload || "(empty payload)"}</p>
    </button>
  </article>
);

function App() {
  const [state, setState] = useState(initialSession);
  const [status, setStatusValue] = useState("idle");
  const [appVersion, setAppVersion] = useState("dev");
  const [connectFeedback, setConnectFeedback] = useState("");
  const [appFeedback, setAppFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [appFeedbackIsError, setAppFeedbackIsError] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState("MQTT Shark will try to reconnect automatically.");
  const [reconnectDetail, setReconnectDetail] = useState("Next attempt in 5s");
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const send = (message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setConnectFeedback("WebSocket is not connected");
      setFeedbackIsError(true);
      return;
    }

    socketRef.current.send(JSON.stringify(message));
  };

  const updateStatus = (nextStatus) => {
    setStatusValue(nextStatus);

    if (nextStatus === "connecting") {
      setState((current) => ({
        ...current,
        reconnectAttemptInFlight: current.reconnectActive ? true : current.reconnectAttemptInFlight
      }));
      if (stateRef.current.reconnectActive) {
        setReconnectDetail("Reconnecting...");
      }
      setConnectFeedback("Connecting...");
      setFeedbackIsError(false);
      return;
    }

    if (nextStatus === "connected") {
      setState((current) => {
        const wasReconnecting = current.reconnectActive;
        const next = {
          ...current,
          connected: true,
          broker: current.pendingBroker || current.broker,
          pendingBroker: null,
          reconnectActive: false,
          reconnectAttemptInFlight: false,
          reconnectNextAt: null
        };

        if (wasReconnecting) {
          window.setTimeout(() => restoreSubscriptions(next), 0);
          setAppFeedback("Reconnected to broker");
          setAppFeedbackIsError(false);
        }

        return next;
      });
      stopReconnectLoop();
      setConnectFeedback("");
      setFeedbackIsError(false);
      setAppFeedback("");
      setAppFeedbackIsError(false);
      return;
    }

    if (nextStatus === "reconnecting" && stateRef.current.connected) {
      startReconnectLoop("Broker is reconnecting...");
      return;
    }

    if (nextStatus === "disconnected" && stateRef.current.connected) {
      if (stateRef.current.manualDisconnecting) {
        stopReconnectLoop();
        setState((current) => ({ ...initialSession, lastConnectCommand: null }));
        setConnectFeedback("Disconnected from broker");
        setFeedbackIsError(true);
        return;
      }

      startReconnectLoop("Broker connection lost. Reconnect is required.");
    }
  };

  const resetSession = () => {
    stopReconnectLoop();
    setState((current) => ({
      ...initialSession,
      lastConnectCommand: current.lastConnectCommand
    }));
  };

  const stopReconnectLoop = () => {
    if (reconnectTimerRef.current) {
      window.clearInterval(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setState((current) => ({
      ...current,
      reconnectActive: false,
      reconnectAttemptInFlight: false,
      reconnectNextAt: null
    }));
  };

  const scheduleReconnectAttempt = (delayMs) => {
    const reconnectNextAt = Date.now() + delayMs;
    setState((current) => ({
      ...current,
      reconnectNextAt,
      reconnectAttemptInFlight: false
    }));
    updateReconnectCountdown(reconnectNextAt);
  };

  const updateReconnectCountdown = (nextAt = stateRef.current.reconnectNextAt) => {
    if (!nextAt) {
      return;
    }

    const seconds = Math.max(1, Math.ceil((nextAt - Date.now()) / 1000));
    setReconnectDetail(`Next attempt in ${seconds}s`);
  };

  const tickReconnectLoop = () => {
    const current = stateRef.current;
    if (!current.reconnectActive || current.reconnectAttemptInFlight) {
      return;
    }

    if (Date.now() >= current.reconnectNextAt) {
      attemptReconnect();
      return;
    }

    updateReconnectCountdown(current.reconnectNextAt);
  };

  const startReconnectLoop = (message = "MQTT Shark will try to reconnect automatically.") => {
    if (!stateRef.current.lastConnectCommand) {
      setAppFeedback("Broker connection lost. Reconnect from the connection screen.");
      setAppFeedbackIsError(true);
      return;
    }

    const alreadyActive = stateRef.current.reconnectActive;
    setReconnectMessage(message);
    setState((current) => ({
      ...current,
      reconnectActive: true
    }));

    if (!alreadyActive && !stateRef.current.reconnectAttemptInFlight) {
      scheduleReconnectAttempt(5000);
    }

    if (!reconnectTimerRef.current) {
      reconnectTimerRef.current = window.setInterval(tickReconnectLoop, 1000);
    }
  };

  const attemptReconnect = () => {
    if (stateRef.current.reconnectAttemptInFlight) {
      setReconnectDetail("Reconnect attempt is already running...");
      return;
    }

    if (!stateRef.current.lastConnectCommand || socketRef.current?.readyState !== WebSocket.OPEN) {
      setReconnectDetail("WebSocket is disconnected");
      scheduleReconnectAttempt(5000);
      return;
    }

    setState((current) => ({
      ...current,
      reconnectAttemptInFlight: true,
      reconnectNextAt: null
    }));
    setReconnectDetail("Reconnecting...");
    send(stateRef.current.lastConnectCommand);
  };

  const restoreSubscriptions = (snapshot = stateRef.current) => {
    const topics = [...snapshot.subscriptions];

    if (snapshot.discovering) {
      topics.push("#");
    }

    setState((current) => ({
      ...current,
      restoringTopics: unique([...current.restoringTopics, ...topics])
    }));

    window.setTimeout(() => {
      for (const topic of topics) {
        const qos = topic === "#" ? 0 : snapshot.subscriptionQoS[topic] ?? 0;
        send({ type: "subscribe", topic, qos });
      }
    }, 0);
  };

  const markReconnectAttemptFailed = (message) => {
    if (!stateRef.current.reconnectActive) {
      return;
    }

    scheduleReconnectAttempt(5000);
    setReconnectDetail(`${message}. Next attempt in 5s`);
  };

  useEffect(() => {
    fetch("/api/info")
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => {
        if (info?.version) {
          setAppVersion(info.version.startsWith("v") ? info.version : `v${info.version}`);
        }
      })
      .catch(() => setAppVersion("dev"));
  }, []);

  useEffect(() => {
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
    socketRef.current = socket;

    socket.addEventListener("open", () => updateStatus("idle"));
    socket.addEventListener("close", () => {
      updateStatus("disconnected");
      if (!stateRef.current.connected) {
        setConnectFeedback("WebSocket disconnected");
        setFeedbackIsError(true);
      }
    });
    socket.addEventListener("error", () => {
      updateStatus("error");
      if (stateRef.current.connected) {
        setAppFeedback("WebSocket error");
        setAppFeedbackIsError(true);
      } else {
        setConnectFeedback("WebSocket error");
        setFeedbackIsError(true);
      }
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "status") {
        updateStatus(message.status);
        return;
      }

      if (message.type === "error") {
        setState((current) => ({
          ...current,
          pendingDiscoveryAction: null
        }));
        markReconnectAttemptFailed(message.message);
        updateStatus("error");
        if (stateRef.current.connected) {
          setAppFeedback(message.message);
          setAppFeedbackIsError(true);
        } else {
          setConnectFeedback(message.message);
          setFeedbackIsError(true);
        }
        return;
      }

      if (message.type === "message") {
        setAppFeedback("");
        setAppFeedbackIsError(false);
        setState((current) => {
          const brokerMessage = {
            id: createMessageId(),
            topic: message.topic,
            payload: message.payload,
            qos: message.qos,
            retain: message.retain,
            receivedAt: message.receivedAt
          };
          const messages = [brokerMessage, ...current.messages].slice(0, maxHistory);
          const shouldSelect = !current.selectedMessageId && messageMatchesTopic(current.activeTopic, brokerMessage);

          return {
            ...current,
            discoveredTopics: unique([...current.discoveredTopics, message.topic]),
            expandedTopicNodes: expandTopicAncestors(current.expandedTopicNodes, message.topic),
            messages,
            selectedMessage: shouldSelect ? brokerMessage : current.selectedMessage,
            selectedMessageId: shouldSelect ? brokerMessage.id : current.selectedMessageId
          };
        });
        return;
      }

      if (message.type === "subscription") {
        setState((current) => {
          if (current.restoringTopics.includes(message.topic)) {
            return {
              ...current,
              restoringTopics: without(current.restoringTopics, message.topic),
              subscriptions: message.topic !== "#" ? unique([...current.subscriptions, message.topic]) : current.subscriptions
            };
          }

          if (message.topic === "#" && current.pendingDiscoveryAction) {
            setAppFeedback(message.subscribed ? "Discovering topics through #" : "Stopped topic discovery");
            setAppFeedbackIsError(false);
            const pendingSubscriptionQoS = { ...current.pendingSubscriptionQoS };
            delete pendingSubscriptionQoS["#"];
            return {
              ...current,
              discovering: message.subscribed,
              pendingDiscoveryAction: null,
              pendingSubscriptionQoS
            };
          }

          const subscriptionQoS = { ...current.subscriptionQoS };
          const pendingSubscriptionQoS = { ...current.pendingSubscriptionQoS };
          let subscriptions = current.subscriptions;
          let discoveredTopics = current.discoveredTopics;
          let activeTopic = current.activeTopic;
          let selectedMessage = current.selectedMessage;
          let selectedMessageId = current.selectedMessageId;

          if (message.subscribed) {
            subscriptions = unique([...subscriptions, message.topic]);
            subscriptionQoS[message.topic] = pendingSubscriptionQoS[message.topic] ?? 0;
            delete pendingSubscriptionQoS[message.topic];
            if (!isWildcardTopic(message.topic)) {
              discoveredTopics = unique([...discoveredTopics, message.topic]);
              activeTopic = message.topic;
              selectedMessage = messagesForTopic({ ...current, activeTopic }, activeTopic)[0] || null;
              selectedMessageId = selectedMessage?.id || null;
            }
            setAppFeedback(`Subscribed to ${message.topic}`);
            setAppFeedbackIsError(false);
          } else {
            subscriptions = without(subscriptions, message.topic);
            delete subscriptionQoS[message.topic];
            delete pendingSubscriptionQoS[message.topic];
            if (activeTopic === message.topic) {
              activeTopic = "all";
              selectedMessage = messagesForTopic({ ...current, activeTopic }, activeTopic)[0] || null;
              selectedMessageId = selectedMessage?.id || null;
            }
            setAppFeedback(`Unsubscribed from ${message.topic}`);
            setAppFeedbackIsError(false);
          }

          return {
            ...current,
            subscriptions,
            subscriptionQoS,
            pendingSubscriptionQoS,
            discoveredTopics,
            activeTopic,
            selectedMessage,
            selectedMessageId
          };
        });
      }
    });

    return () => {
      socket.close();
      if (reconnectTimerRef.current) {
        window.clearInterval(reconnectTimerRef.current);
      }
    };
  }, []);

  const activeMessages = useMemo(() => messagesForTopic(state), [state]);
  const latestMessages = activeMessages.slice(0, visibleMessages);
  const selectedOutsideLatest = state.selectedMessage
    && messageMatchesTopic(state.activeTopic, state.selectedMessage)
    && !latestMessages.some((message) => message.id === state.selectedMessage.id);
  const visibleHistory = selectedOutsideLatest ? [state.selectedMessage, ...latestMessages] : latestMessages;
  const discoveredTopics = useMemo(() => getDiscoveredTopics(state), [state]);
  const wildcardSubscriptions = state.subscriptions
    .filter((topic) => isWildcardTopic(topic))
    .sort((left, right) => left.localeCompare(right));
  const formattedPayload = state.selectedMessage
    ? formatPayload(state.selectedMessage.payload || "", state.payloadFormat)
    : null;

  const selectTopic = (topic) => {
    setState((current) => {
      const selectedMessage = messagesForTopic({ ...current, activeTopic: topic }, topic)[0] || null;
      return {
        ...current,
        activeTopic: topic,
        selectedMessage,
        selectedMessageId: selectedMessage?.id || null
      };
    });
  };

  const toggleTopic = (key) => {
    setState((current) => ({
      ...current,
      expandedTopicNodes: current.expandedTopicNodes.includes(key)
        ? without(current.expandedTopicNodes, key)
        : [...current.expandedTopicNodes, key]
    }));
  };

  const subscribe = (topic, qos) => {
    setState((current) => ({
      ...current,
      pendingSubscriptionQoS: {
        ...current.pendingSubscriptionQoS,
        [topic]: qos
      }
    }));
    send({ type: "subscribe", topic, qos });
  };

  const unsubscribe = (topic) => {
    send({ type: "unsubscribe", topic });
  };

  const startTopicDiscovery = () => {
    if (state.discovering || state.pendingDiscoveryAction) {
      return;
    }

    setState((current) => ({
      ...current,
      pendingDiscoveryAction: "start",
      pendingSubscriptionQoS: {
        ...current.pendingSubscriptionQoS,
        "#": 0
      }
    }));
    send({ type: "subscribe", topic: "#", qos: 0 });
  };

  const stopTopicDiscovery = () => {
    if (!state.discovering || state.pendingDiscoveryAction) {
      return;
    }

    setState((current) => ({
      ...current,
      pendingDiscoveryAction: "stop"
    }));
    send({ type: "unsubscribe", topic: "#" });
  };

  const onConnect = (event) => {
    event.preventDefault();
    const broker = brokerURLFromForm(new FormData(event.currentTarget));
    const command = {
      type: "connect",
      url: broker.url,
      clean: true
    };

    resetSession();
    setState((current) => ({
      ...current,
      pendingBroker: broker,
      lastConnectCommand: command
    }));
    send(command);
  };

  const onSubscribe = (event) => {
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
    setState((current) => ({
      ...current,
      manualDisconnecting: true
    }));
    stopReconnectLoop();
    send({ type: "disconnect" });
  };

  return (
    <>
      {!state.connected ? (
        <main id="connect-screen" className="connect-screen">
          <section className="connect-card" aria-labelledby="connection-title">
            <div className="connect-brand">
              <h1 id="connection-title">MQTT Shark</h1>
              <span className="app-version">{appVersion}</span>
            </div>
            <form className="connect-form" onSubmit={onConnect}>
              <label>
                Host-name
                <input name="host" placeholder="localhost" autoComplete="hostname" required autoFocus />
              </label>
              <label>
                Port
                <input name="port" type="number" min="1" max="65535" defaultValue="1883" inputMode="numeric" required />
              </label>
              <button type="submit" disabled={status === "connecting"}>Connect</button>
              <p className={`feedback${feedbackIsError ? " feedback-error" : ""}`} role="status">{connectFeedback}</p>
            </form>
          </section>
        </main>
      ) : (
        <div className="app-shell">
          <header className="topbar">
            <div className="broker-heading">
              <span className="eyebrow">Broker</span>
              <h1>{state.broker ? `${state.broker.host}:${state.broker.port}` : "MQTT Shark"}</h1>
            </div>
            <div className="topbar-actions">
              <span className={`status status-${status}`}>{status}</span>
              <button type="button" className="secondary" onClick={disconnect}>Disconnect</button>
            </div>
          </header>

          <main className="workspace">
            <aside className="panel topics-panel" aria-labelledby="topics-title">
              <div className="panel-heading">
                <div>
                  <h2 id="topics-title">Discovered topics</h2>
                  <p className="topics-meta">Observed through # discovery</p>
                </div>
                <button
                  type="button"
                  className={`secondary compact${state.discovering ? " is-active" : ""}`}
                  disabled={Boolean(state.pendingDiscoveryAction)}
                  onClick={state.discovering ? stopTopicDiscovery : startTopicDiscovery}
                >
                  {state.discovering ? "Stop" : "Discover"}
                </button>
              </div>
              <form className="subscribe-form" onSubmit={onSubscribe}>
                <input name="topic" placeholder="sensors/#" required />
                <div className="subscribe-actions">
                  <select name="qos" aria-label="Subscribe QoS" defaultValue="0">
                    <option value="0">QoS 0</option>
                    <option value="1">QoS 1</option>
                    <option value="2">QoS 2</option>
                  </select>
                  <button type="submit">Subscribe</button>
                </div>
              </form>
              <ul className="topics-list">
                <TopicButton
                  topic="all"
                  label="All topics"
                  count={state.messages.length}
                  subscribed={false}
                  activeTopic={state.activeTopic}
                  onSelect={selectTopic}
                  onUnsubscribe={unsubscribe}
                />
                {wildcardSubscriptions.map((topic) => (
                  <TopicButton
                    key={topic}
                    topic={topic}
                    label={`Filter: ${topic}`}
                    count={messagesForTopic(state, topic).length}
                    subscribed
                    activeTopic={state.activeTopic}
                    onSelect={selectTopic}
                    onUnsubscribe={unsubscribe}
                  />
                ))}
                {discoveredTopics.length === 0 ? (
                  <li className="topics-empty">
                    {state.discovering ? "Waiting for broker messages" : "Start discovery to observe topics"}
                  </li>
                ) : buildTopicTree(discoveredTopics).map((node) => (
                  <TopicTreeItem
                    key={node.key}
                    node={node}
                    depth={0}
                    state={state}
                    onToggle={toggleTopic}
                    onSelect={selectTopic}
                    onUnsubscribe={unsubscribe}
                  />
                ))}
              </ul>
            </aside>

            <section className="panel payload-panel" aria-labelledby="payload-title">
              <div className="panel-heading payload-heading">
                <h2 id="payload-title">Payload</h2>
                <label className="payload-format-control">
                  Format
                  <select
                    aria-label="Payload format"
                    value={state.payloadFormat}
                    onChange={(event) => setState((current) => ({ ...current, payloadFormat: event.target.value }))}
                  >
                    <option value="auto">Auto</option>
                    <option value="text">Text</option>
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                    <option value="binary">Binary</option>
                    <option value="base64">Base64</option>
                  </select>
                </label>
              </div>
              {state.selectedMessage && formattedPayload ? (
                <>
                  <div className="payload-meta">
                    <MetaItem label="Topic" value={state.selectedMessage.topic} />
                    <MetaItem label="Received" value={new Date(state.selectedMessage.receivedAt).toLocaleString()} />
                    <MetaItem label="QoS" value={String(state.selectedMessage.qos)} />
                    <MetaItem label="Retain" value={state.selectedMessage.retain ? "Yes" : "No"} />
                    <MetaItem label="Payload" value={`${new Blob([state.selectedMessage.payload || ""]).size} B`} />
                    <MetaItem label="Format" value={formattedPayload.label} />
                  </div>
                  <pre className="payload-viewer">{formattedPayload.body}</pre>
                </>
              ) : (
                <div className="payload-empty">Select a message in Messages on the right</div>
              )}
            </section>

            <aside className="panel history-panel" aria-labelledby="messages-title">
              <div className="panel-heading">
                <div>
                  <h2 id="messages-title">Messages</h2>
                  <p className="history-meta">
                    {selectedOutsideLatest
                      ? `Selected + ${latestMessages.length} of latest ${visibleMessages} shown`
                      : `${latestMessages.length} of latest ${visibleMessages} shown`}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => setState((current) => ({
                    ...current,
                    messages: [],
                    selectedMessageId: null,
                    selectedMessage: null
                  }))}
                >
                  Clear
                </button>
              </div>
              <p className={`feedback app-feedback${appFeedbackIsError ? " feedback-error" : ""}`} role="status">{appFeedback}</p>
              <div className="messages" aria-live="polite">
                {visibleHistory.length === 0 ? (
                  <p className="empty-state">No messages yet</p>
                ) : visibleHistory.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    selected={message.id === state.selectedMessageId}
                    pinned={selectedOutsideLatest && message.id === state.selectedMessage?.id}
                    onSelect={(selectedMessage) => setState((current) => ({
                      ...current,
                      selectedMessage,
                      selectedMessageId: selectedMessage.id
                    }))}
                  />
                ))}
              </div>
            </aside>
          </main>

          {state.reconnectActive ? (
            <div className="modal-backdrop">
              <section className="modal" role="alertdialog" aria-labelledby="reconnect-title" aria-describedby="reconnect-message">
                <div>
                  <h2 id="reconnect-title">Broker connection lost</h2>
                  <p id="reconnect-message">{reconnectMessage}</p>
                </div>
                <p className="modal-detail">{reconnectDetail}</p>
                <div className="modal-actions">
                  <button type="button" disabled={state.reconnectAttemptInFlight} onClick={attemptReconnect}>
                    {state.reconnectAttemptInFlight ? "Reconnecting..." : "Reconnect now"}
                  </button>
                  <button type="button" className="secondary" onClick={disconnect}>Disconnect</button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

export default App;
