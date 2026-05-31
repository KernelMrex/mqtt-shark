const ReconnectModal = ({
  reconnectMessage,
  reconnectDetail,
  reconnectAttemptInFlight,
  onReconnect,
  onDisconnect
}) => (
  <div className="modal-backdrop">
    <section className="modal" role="alertdialog" aria-labelledby="reconnect-title" aria-describedby="reconnect-message">
      <div>
        <h2 id="reconnect-title">Broker connection lost</h2>
        <p id="reconnect-message">{reconnectMessage}</p>
      </div>
      <p className="modal-detail">{reconnectDetail}</p>
      <div className="modal-actions">
        <button type="button" disabled={reconnectAttemptInFlight} onClick={onReconnect}>
          {reconnectAttemptInFlight ? "Reconnecting..." : "Reconnect now"}
        </button>
        <button type="button" className="secondary" onClick={onDisconnect}>Disconnect</button>
      </div>
    </section>
  </div>
);

export default ReconnectModal;
