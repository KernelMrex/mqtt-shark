import { useEffect, useState } from "react";

const formatVersion = (version) => (version.startsWith("v") ? version : `v${version}`);

export const useAppInfo = () => {
  const [appInfo, setAppInfo] = useState({
    appVersion: "dev",
    defaultBrokerHost: ""
  });

  useEffect(() => {
    fetch("/api/info")
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => {
        setAppInfo({
          appVersion: info?.version ? formatVersion(info.version) : "dev",
          defaultBrokerHost: info?.defaultBrokerHost || ""
        });
      })
      .catch(() => {
        setAppInfo({
          appVersion: "dev",
          defaultBrokerHost: ""
        });
      });
  }, []);

  return appInfo;
};
