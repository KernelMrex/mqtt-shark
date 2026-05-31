import { buildTopicTree, messagesForTopic, sortTopicNodes } from "../utils/topic";

const topicMetaLabel = (count, subscribed) => {
  return subscribed ? `${count} msg \u00b7 subscribed` : `${count} msg`;
};

const TopicButton = ({ topic, label = topic, count, subscribed, activeTopic, onSelect, onUnsubscribe }) => (
  <li>
    <button
      type="button"
      className={`topic-button${activeTopic === topic ? " is-active" : ""}`}
      onClick={() => onSelect(topic)}
    >
      <span className="topic-name">{label}</span>
      <span className="topic-meta">{topicMetaLabel(count, subscribed)}</span>
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
          {"\u00d7"}
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
          {hasChildren ? (isExpanded ? "\u25be" : "\u25b8") : ""}
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
          <span className="topic-meta">{topicMetaLabel(node.count, node.subscribed)}</span>
        </button>
        {node.subscribed ? (
          <button
            type="button"
            className="topic-remove"
            title={`Unsubscribe from ${node.topic}`}
            onClick={() => onUnsubscribe(node.topic)}
          >
            {"\u00d7"}
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

const TopicsPanel = ({
  state,
  discoveredTopics,
  wildcardSubscriptions,
  onSubscribe,
  onSelectTopic,
  onToggleTopic,
  onUnsubscribe,
  onStartDiscovery,
  onStopDiscovery
}) => (
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
        onClick={state.discovering ? onStopDiscovery : onStartDiscovery}
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
        onSelect={onSelectTopic}
        onUnsubscribe={onUnsubscribe}
      />
      {wildcardSubscriptions.map((topic) => (
        <TopicButton
          key={topic}
          topic={topic}
          label={`Filter: ${topic}`}
          count={messagesForTopic(state, topic).length}
          subscribed
          activeTopic={state.activeTopic}
          onSelect={onSelectTopic}
          onUnsubscribe={onUnsubscribe}
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
          onToggle={onToggleTopic}
          onSelect={onSelectTopic}
          onUnsubscribe={onUnsubscribe}
        />
      ))}
    </ul>
  </aside>
);

export default TopicsPanel;
