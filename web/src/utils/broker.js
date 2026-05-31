export const brokerURLFromForm = (form) => {
  const host = String(form.get("host") || "").trim();
  const port = String(form.get("port") || "1883").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(host);
  const url = hasScheme ? host : `mqtt://${host}:${port}`;

  return { host, port, url };
};
