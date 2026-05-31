import { visibleMessages } from "../constants/session";

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
          {pinned ? "selected \u00b7 " : ""}
          {new Date(message.receivedAt).toLocaleTimeString()} {"\u00b7"} QoS {message.qos}
          {message.retain ? " \u00b7 retained" : ""}
        </span>
      </div>
      <p className="message-preview">{message.payload || "(empty payload)"}</p>
    </button>
  </article>
);

const MessagesPanel = ({
  activeMessageCount,
  latestMessages,
  visibleHistory,
  selectedMessage,
  selectedMessageId,
  selectedOutsideLatest,
  appFeedback,
  appFeedbackIsError,
  onClearMessages,
  onSelectMessage
}) => (
  <aside className="panel history-panel" aria-labelledby="messages-title">
    <div className="panel-heading">
      <div>
        <h2 id="messages-title">Messages</h2>
        <p className="history-meta">
          {selectedOutsideLatest
            ? `Selected + ${latestMessages.length} of latest ${visibleMessages} shown`
            : `${latestMessages.length} of ${activeMessageCount} total shown`}
        </p>
      </div>
      <button type="button" className="secondary compact" onClick={onClearMessages}>
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
          selected={message.id === selectedMessageId}
          pinned={selectedOutsideLatest && message.id === selectedMessage?.id}
          onSelect={onSelectMessage}
        />
      ))}
    </div>
  </aside>
);

export default MessagesPanel;
