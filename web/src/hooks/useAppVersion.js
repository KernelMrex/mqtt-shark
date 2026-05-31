import { useEffect, useState } from "react";

export const useAppVersion = () => {
  const [appVersion, setAppVersion] = useState("dev");

  useEffect(() => {
    fetch("/api/info")
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => {
        if (info?.version) {
          setAppVersion(info.version.startsWith("v") ? info.version : `v${info.version}`);
        }
      })
      .catch(() => setAppVersion("dev"));
  }, []);

  return appVersion;
};
