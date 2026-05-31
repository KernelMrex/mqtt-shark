const Topbar = ({ broker, status, onDisconnect }) => (
  <header className="topbar">
    <div className="broker-heading">
      <span className="eyebrow">Broker</span>
      <h1>{broker ? `${broker.host}:${broker.port}` : "MQTT Shark"}</h1>
    </div>
    <div className="topbar-actions">
      <span className={`status status-${status}`}>{status}</span>
      <button type="button" className="secondary" onClick={onDisconnect}>Disconnect</button>
    </div>
  </header>
);

export default Topbar;
