import { useState } from "react";

import { maxHistory } from "../constants/session";
import { isWildcardTopic, messageMatchesTopic } from "../utils/topic";

const historyCounter = ({ memoryMessageCount, selectedOutsideLatest }) => {
  const numerator = selectedOutsideLatest ? `${memoryMessageCount}+1` : String(memoryMessageCount);

  return `${numerator}/${maxHistory}`;
};

const MessageCard = ({ message, selected, pinned, selectedCopy, onSelect }) => (
  <article className={`message-card${pinned ? " is-pinned" : ""}${selectedCopy ? " is-selected-copy" : ""}`}>
    <button
      type="button"
      className={`message-button${selected ? " is-active" : ""}`}
      onClick={() => onSelect(message)}
    >
      <div className="message-meta">
        <span className="message-topic">{message.topic}</span>
        <span>
          {pinned ? "selected \u00b7 " : ""}
          {new Date(message.receivedAt).toLocaleTimeString()} {"\u00b7"} QoS {message.qos}
          {message.retain ? " \u00b7 retained" : ""}
        </span>
      </div>
      <p className="message-preview">{message.payload || "(empty payload)"}</p>
    </button>
  </article>
);

const PublishMessageModal = ({ initialTopic, onClose, onPublishMessage }) => {
  const [topic, setTopic] = useState(initialTopic);

  const handleSubmit = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const nextTopic = String(form.get("topic") || "").trim();

    if (!nextTopic) {
      return;
    }

    onPublishMessage({
      topic: nextTopic,
      payload: String(form.get("payload") ?? ""),
      qos: Number(form.get("qos") || 0),
      retain: form.get("retain") === "on"
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal publish-modal" aria-labelledby="publish-title" role="dialog" aria-modal="true">
        <div>
          <h2 id="publish-title">Send Message</h2>
        </div>
        <form className="publish-form" onSubmit={handleSubmit}>
          <label>
            Topic
            <input
              name="topic"
              placeholder="sensors/temp"
              required
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <label>
            Payload
            <textarea name="payload" placeholder="Message payload" rows="6" />
          </label>
          <div className="publish-actions">
            <select name="qos" aria-label="Publish QoS" defaultValue="0">
              <option value="0">QoS 0</option>
              <option value="1">QoS 1</option>
              <option value="2">QoS 2</option>
            </select>
            <label className="retain-field">
              <input name="retain" type="checkbox" />
              <span>Retain</span>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit">Send</button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

const MessagesPanel = ({
  activeTopic,
  latestMessages,
  visibleHistory,
  selectedMessage,
  selectedMessageId,
  selectedOutsideLatest,
  appFeedback,
  appFeedbackIsError,
  onClearMessages,
  onPublishMessage,
  onSelectMessage
}) => {
  const [showPublishModal, setShowPublishModal] = useState(false);
  const suggestedTopic = selectedMessage?.topic || (activeTopic !== "all" && !isWildcardTopic(activeTopic) ? activeTopic : "");
  const pinnedMessage = selectedMessage && messageMatchesTopic(activeTopic, selectedMessage) ? selectedMessage : null;

  return (
    <aside className="panel history-panel" aria-labelledby="messages-title">
      <div className="panel-heading">
        <div>
          <h2 id="messages-title">Messages</h2>
          <p className="history-meta">
            {historyCounter({
              memoryMessageCount: latestMessages.length,
              selectedOutsideLatest
            })}
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="compact" onClick={() => setShowPublishModal(true)}>
            Send
          </button>
          <button type="button" className="secondary compact" onClick={onClearMessages}>
            Clear
          </button>
        </div>
      </div>
      <p className={`feedback app-feedback${appFeedbackIsError ? " feedback-error" : ""}`} role="status">{appFeedback}</p>
      {pinnedMessage ? (
        <div className="pinned-message">
          <MessageCard
            message={pinnedMessage}
            selected
            pinned
            onSelect={onSelectMessage}
          />
        </div>
      ) : null}
      <div className="messages" aria-live="polite">
        {visibleHistory.length === 0 ? (
          <p className="empty-state">No messages yet</p>
        ) : visibleHistory.map((message) => {
          const selectedCopy = message.id === selectedMessageId;

          return (
            <MessageCard
              key={message.id}
              message={message}
              selected={selectedCopy && !pinnedMessage}
              selectedCopy={selectedCopy}
              onSelect={onSelectMessage}
            />
          );
        })}
      </div>
      {showPublishModal ? (
        <PublishMessageModal
          initialTopic={suggestedTopic}
          onClose={() => setShowPublishModal(false)}
          onPublishMessage={onPublishMessage}
        />
      ) : null}
    </aside>
  );
};

export default MessagesPanel;
