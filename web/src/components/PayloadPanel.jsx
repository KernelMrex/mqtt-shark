import Prism from "prismjs";
import "prismjs/components/prism-json";

const MetaItem = ({ label, value }) => (
  <span>
    <strong>{label}</strong>
    <span>{value}</span>
  </span>
);

const HighlightedPayload = ({ formattedPayload }) => {
  if (formattedPayload.label !== "JSON") {
    return (
      <pre className="payload-viewer">
        <code>{formattedPayload.body}</code>
      </pre>
    );
  }

  const highlightedPayload = Prism.highlight(formattedPayload.body, Prism.languages.json, "json");

  return (
    <pre className="payload-viewer language-json">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: highlightedPayload }} />
    </pre>
  );
};

const PayloadPanel = ({ selectedMessage, formattedPayload, payloadFormat, onPayloadFormatChange }) => (
  <section className="panel payload-panel" aria-labelledby="payload-title">
    <div className="panel-heading payload-heading">
      <h2 id="payload-title">Payload</h2>
      <label className="payload-format-control">
        Format
        <select
          aria-label="Payload format"
          value={payloadFormat}
          onChange={(event) => onPayloadFormatChange(event.target.value)}
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
    {selectedMessage && formattedPayload ? (
      <>
        <div className="payload-meta">
          <MetaItem label="Topic" value={selectedMessage.topic} />
          <MetaItem label="Received" value={new Date(selectedMessage.receivedAt).toLocaleString()} />
          <MetaItem label="QoS" value={String(selectedMessage.qos)} />
          <MetaItem label="Retain" value={selectedMessage.retain ? "Yes" : "No"} />
          <MetaItem label="Payload" value={`${new Blob([selectedMessage.payload || ""]).size} B`} />
          <MetaItem label="Format" value={formattedPayload.label} />
        </div>
        <HighlightedPayload formattedPayload={formattedPayload} />
      </>
    ) : (
      <div className="payload-empty">Select a message in Messages on the right</div>
    )}
  </section>
);

export default PayloadPanel;
