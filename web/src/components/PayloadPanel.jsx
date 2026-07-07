import { memo, useEffect, useMemo, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-json";

const MetaItem = ({ label, value }) => (
  <span>
    <strong>{label}</strong>
    <span>{value}</span>
  </span>
);

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textarea.remove();
  }
};

const HighlightedPayload = memo(({ formattedPayload }) => {
  const highlightedPayload = useMemo(
    () => formattedPayload.label === "JSON"
      ? Prism.highlight(formattedPayload.body, Prism.languages.json, "json")
      : "",
    [formattedPayload.body, formattedPayload.label]
  );

  if (formattedPayload.label !== "JSON") {
    return (
      <pre className="payload-viewer">
        <code>{formattedPayload.body}</code>
      </pre>
    );
  }

  return (
    <pre className="payload-viewer language-json">
      <code className="language-json" dangerouslySetInnerHTML={{ __html: highlightedPayload }} />
    </pre>
  );
});

const PayloadPanel = memo(({ selectedMessage, formattedPayload, payloadFormat, onPayloadFormatChange }) => {
  const [copyStatus, setCopyStatus] = useState("idle");
  const copyResetTimerRef = useRef(null);
  const copyButtonLabel = copyStatus === "copied" ? "Copied" : "Copy";

  useEffect(() => {
    setCopyStatus("idle");
  }, [formattedPayload]);

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const queueCopyStatusReset = (delay) => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyResetTimerRef.current = null;
    }, delay);
  };

  const handleCopyPayload = async () => {
    if (!formattedPayload) {
      return;
    }

    try {
      await copyTextToClipboard(formattedPayload.body);
      setCopyStatus("copied");
      queueCopyStatusReset(1200);
    } catch {
      setCopyStatus("failed");
      queueCopyStatusReset(1800);
    }
  };

  return (
    <section className="panel payload-panel" aria-labelledby="payload-title">
      <div className="panel-heading payload-heading">
        <h2 id="payload-title">Payload</h2>
        <div className="payload-controls">
          <button
            type="button"
            className={`secondary compact payload-copy${copyStatus === "failed" ? " is-error" : ""}`}
            disabled={!formattedPayload}
            onClick={handleCopyPayload}
          >
            {copyStatus === "failed" ? "Failed" : copyButtonLabel}
          </button>
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
});

export default PayloadPanel;
