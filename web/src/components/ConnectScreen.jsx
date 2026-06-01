import { useEffect, useState } from "react";

const ConnectScreen = ({
  appVersion,
  defaultBrokerHost,
  connectFeedback,
  feedbackIsError,
  status,
  onConnect
}) => {
  const [host, setHost] = useState(defaultBrokerHost || "");
  const [hostEdited, setHostEdited] = useState(false);

  useEffect(() => {
    if (!hostEdited) {
      setHost(defaultBrokerHost || "");
    }
  }, [defaultBrokerHost, hostEdited]);

  return (
    <main id="connect-screen" className="connect-screen">
      <section className="connect-card" aria-labelledby="connection-title">
        <div className="connect-brand">
          <h1 id="connection-title">MQTT Shark</h1>
          <span className="app-version">{appVersion}</span>
        </div>
        <form className="connect-form" onSubmit={onConnect}>
          <label>
            Host-name
            <input
              name="host"
              placeholder="localhost"
              autoComplete="hostname"
              required
              autoFocus
              value={host}
              onChange={(event) => {
                setHostEdited(true);
                setHost(event.target.value);
              }}
            />
          </label>
          <label>
            Port
            <input name="port" type="number" min="1" max="65535" defaultValue="1883" inputMode="numeric" required />
          </label>
          <label className="checkbox-field">
            <input name="autoDiscovery" type="checkbox" defaultChecked />
            <span>
              Auto-discover topics
              <small>Subscribe to # after connect</small>
            </span>
          </label>
          <button type="submit" disabled={status === "connecting"}>Connect</button>
          <p className={`feedback${feedbackIsError ? " feedback-error" : ""}`} role="status">{connectFeedback}</p>
        </form>
      </section>
    </main>
  );
};

export default ConnectScreen;
