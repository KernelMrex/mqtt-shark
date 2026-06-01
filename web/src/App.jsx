import ConnectScreen from "./components/ConnectScreen";
import MessagesPanel from "./components/MessagesPanel";
import PayloadPanel from "./components/PayloadPanel";
import ReconnectModal from "./components/ReconnectModal";
import Topbar from "./components/Topbar";
import TopicsPanel from "./components/TopicsPanel";
import { useAppInfo } from "./hooks/useAppInfo";
import { useMqttSession } from "./hooks/useMqttSession";

function App() {
  const { appVersion, defaultBrokerHost } = useAppInfo();
  const {
    state,
    status,
    actions,
    activeMessageCount,
    appFeedback,
    appFeedbackIsError,
    connectFeedback,
    discoveredTopics,
    feedbackIsError,
    formattedPayload,
    latestMessages,
    reconnectDetail,
    reconnectMessage,
    selectedOutsideLatest,
    visibleHistory,
    wildcardSubscriptions
  } = useMqttSession();

  if (!state.connected) {
    return (
      <ConnectScreen
        appVersion={appVersion}
        defaultBrokerHost={defaultBrokerHost}
        connectFeedback={connectFeedback}
        feedbackIsError={feedbackIsError}
        status={status}
        onConnect={actions.connect}
      />
    );
  }

  return (
    <div className="app-shell">
      <Topbar broker={state.broker} status={status} onDisconnect={actions.disconnect} />

      <main className="workspace">
        <TopicsPanel
          state={state}
          discoveredTopics={discoveredTopics}
          wildcardSubscriptions={wildcardSubscriptions}
          onSubscribe={actions.submitSubscription}
          onSelectTopic={actions.selectTopic}
          onToggleTopic={actions.toggleTopic}
          onUnsubscribe={actions.unsubscribe}
          onStartDiscovery={actions.startTopicDiscovery}
          onStopDiscovery={actions.stopTopicDiscovery}
        />

        <PayloadPanel
          selectedMessage={state.selectedMessage}
          formattedPayload={formattedPayload}
          payloadFormat={state.payloadFormat}
          onPayloadFormatChange={actions.setPayloadFormat}
        />

        <MessagesPanel
          activeMessageCount={activeMessageCount}
          latestMessages={latestMessages}
          visibleHistory={visibleHistory}
          selectedMessage={state.selectedMessage}
          selectedMessageId={state.selectedMessageId}
          selectedOutsideLatest={selectedOutsideLatest}
          appFeedback={appFeedback}
          appFeedbackIsError={appFeedbackIsError}
          onClearMessages={actions.clearMessages}
          onSelectMessage={actions.selectMessage}
        />
      </main>

      {state.reconnectActive ? (
        <ReconnectModal
          reconnectMessage={reconnectMessage}
          reconnectDetail={reconnectDetail}
          reconnectAttemptInFlight={state.reconnectAttemptInFlight}
          onReconnect={actions.attemptReconnect}
          onDisconnect={actions.disconnect}
        />
      ) : null}
    </div>
  );
}

export default App;
