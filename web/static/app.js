const statusElement = document.querySelector("#status");
const messagesElement = document.querySelector("#messages");
const subscriptionsElement = document.querySelector("#subscriptions");
const connectionForm = document.querySelector("#connection-form");
const subscribeForm = document.querySelector("#subscribe-form");
const publishForm = document.querySelector("#publish-form");
const appVersionElement = document.querySelector("#app-version");

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
const subscriptions = new Set();

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
    addSystemMessage("WebSocket is not connected");
    return;
  }

  socket.send(JSON.stringify(message));
};

const setStatus = (status) => {
  statusElement.textContent = status;
  statusElement.className = `status status-${status}`;
};

const addSystemMessage = (message) => {
  const item = document.createElement("article");
  item.className = "message";
  item.innerHTML = `
    <div class="message-meta">
      <span class="message-topic">system</span>
      <span>${new Date().toLocaleTimeString()}</span>
    </div>
    <pre></pre>
  `;
  item.querySelector("pre").textContent = message;
  messagesElement.prepend(item);
};

const addBrokerMessage = ({ topic, payload, qos, retain, receivedAt }) => {
  const item = document.createElement("article");
  item.className = "message";
  item.innerHTML = `
    <div class="message-meta">
      <span class="message-topic"></span>
      <span></span>
    </div>
    <pre></pre>
  `;
  item.querySelector(".message-topic").textContent = topic;
  item.querySelector(".message-meta span:last-child").textContent =
    `${new Date(receivedAt).toLocaleTimeString()} · QoS ${qos}${retain ? " · retained" : ""}`;
  item.querySelector("pre").textContent = payload;
  messagesElement.prepend(item);
};

const renderSubscriptions = () => {
  subscriptionsElement.replaceChildren();

  for (const topic of subscriptions) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const button = document.createElement("button");

    label.textContent = topic;
    button.type = "button";
    button.textContent = "×";
    button.title = `Unsubscribe from ${topic}`;
    button.addEventListener("click", () => send({ type: "unsubscribe", topic }));

    item.append(label, button);
    subscriptionsElement.append(item);
  }
};

socket.addEventListener("open", () => setStatus("idle"));
socket.addEventListener("close", () => setStatus("disconnected"));
socket.addEventListener("error", () => {
  setStatus("error");
  addSystemMessage("WebSocket error");
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "status") {
    setStatus(message.status);
    return;
  }

  if (message.type === "error") {
    setStatus("error");
    addSystemMessage(message.message);
    return;
  }

  if (message.type === "message") {
    addBrokerMessage(message);
    return;
  }

  if (message.type === "subscription") {
    if (message.subscribed) {
      subscriptions.add(message.topic);
    } else {
      subscriptions.delete(message.topic);
    }

    renderSubscriptions();
    return;
  }

  if (message.type === "published") {
    addSystemMessage(`Published to ${message.topic}`);
  }
});

connectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(connectionForm);

  send({
    type: "connect",
    url: form.get("url"),
    clientId: form.get("clientId"),
    username: form.get("username"),
    password: form.get("password"),
    clean: form.get("clean") === "on"
  });
});

document.querySelector("#disconnect").addEventListener("click", () => {
  subscriptions.clear();
  renderSubscriptions();
  send({ type: "disconnect" });
});

subscribeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  send({
    type: "subscribe",
    topic: document.querySelector("#subscribe-topic").value,
    qos: Number(document.querySelector("#subscribe-qos").value)
  });
});

publishForm.addEventListener("submit", (event) => {
  event.preventDefault();
  send({
    type: "publish",
    topic: document.querySelector("#publish-topic").value,
    payload: document.querySelector("#payload").value,
    qos: Number(document.querySelector("#publish-qos").value),
    retain: document.querySelector("#retain").checked
  });
});

document.querySelector("#clear-messages").addEventListener("click", () => {
  messagesElement.replaceChildren();
});

loadAppInfo();
