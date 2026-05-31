const formatLabel = (format) => ({
  auto: "Auto",
  text: "Text",
  json: "JSON",
  xml: "XML",
  binary: "Binary",
  base64: "Base64"
})[format] || "Text";

const payloadBytes = (payload) => new TextEncoder().encode(payload);

const bytesToBase64 = (bytes) => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const hasBinaryMarkers = (payload) => {
  for (const character of payload) {
    const code = character.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }

  return false;
};

const detectPayloadFormat = (payload) => {
  const trimmed = payload.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(payload);
      return "json";
    } catch {
      return hasBinaryMarkers(payload) ? "binary" : "text";
    }
  }

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    const document = new DOMParser().parseFromString(payload, "application/xml");
    if (!document.querySelector("parsererror")) {
      return "xml";
    }
  }

  return hasBinaryMarkers(payload) ? "binary" : "text";
};

const formatJSONPayload = (payload) => {
  try {
    return {
      label: "JSON",
      body: JSON.stringify(JSON.parse(payload), null, 2)
    };
  } catch (error) {
    return {
      label: "JSON invalid",
      body: `Invalid JSON: ${error.message}\n\n${payload}`
    };
  }
};

const prettyPrintXML = (xml) => {
  const lines = xml.replace(/>\s*</g, ">\n<").split("\n");
  let depth = 0;

  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^<\/[^>]+>/.test(trimmed)) {
      depth = Math.max(depth - 1, 0);
    }

    const output = `${"  ".repeat(depth)}${trimmed}`;

    if (/^<[^!?/][^>]*[^/]>(?!.*<\/[^>]+>$)/.test(trimmed)) {
      depth += 1;
    }

    return output;
  }).join("\n");
};

const formatXMLPayload = (payload) => {
  const document = new DOMParser().parseFromString(payload, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return {
      label: "XML invalid",
      body: `Invalid XML\n\n${payload}`
    };
  }

  return {
    label: "XML",
    body: prettyPrintXML(new XMLSerializer().serializeToString(document))
  };
};

const formatBinaryPayload = (payload) => {
  const bytes = payloadBytes(payload);

  if (bytes.length === 0) {
    return "(empty payload)";
  }

  const rows = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = [...chunk].map((byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
    const ascii = [...chunk].map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");

    rows.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }

  return rows.join("\n");
};

export const formatPayload = (payload, requestedFormat) => {
  if (payload === "") {
    return { label: formatLabel(requestedFormat), body: "(empty payload)" };
  }

  if (requestedFormat === "auto") {
    return formatPayload(payload, detectPayloadFormat(payload));
  }

  if (requestedFormat === "json") {
    return formatJSONPayload(payload);
  }

  if (requestedFormat === "xml") {
    return formatXMLPayload(payload);
  }

  if (requestedFormat === "binary") {
    return {
      label: "Binary",
      body: formatBinaryPayload(payload)
    };
  }

  if (requestedFormat === "base64") {
    return {
      label: "Base64",
      body: bytesToBase64(payloadBytes(payload))
    };
  }

  return {
    label: "Text",
    body: payload
  };
};
