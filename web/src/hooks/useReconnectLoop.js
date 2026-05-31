import { useEffect, useRef, useState } from "react";

const reconnectDelayMs = 5000;

export const useReconnectLoop = ({
  stateRef,
  socketRef,
  send,
  dispatch,
  onMissingReconnectCommand
}) => {
  const [reconnectMessage, setReconnectMessage] = useState("MQTT Shark will try to reconnect automatically.");
  const [reconnectDetail, setReconnectDetail] = useState("Next attempt in 5s");
  const timerRef = useRef(null);

  const stopReconnectLoop = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    dispatch({ type: "reconnectStopped" });
  };

  const updateReconnectCountdown = (nextAt = stateRef.current.reconnectNextAt) => {
    if (!nextAt) {
      return;
    }

    const seconds = Math.max(1, Math.ceil((nextAt - Date.now()) / 1000));
    setReconnectDetail(`Next attempt in ${seconds}s`);
  };

  const scheduleReconnectAttempt = (delayMs = reconnectDelayMs) => {
    const reconnectNextAt = Date.now() + delayMs;
    dispatch({ type: "reconnectScheduled", reconnectNextAt });
    updateReconnectCountdown(reconnectNextAt);
  };

  const attemptReconnect = () => {
    if (stateRef.current.reconnectAttemptInFlight) {
      setReconnectDetail("Reconnect attempt is already running...");
      return;
    }

    if (!stateRef.current.lastConnectCommand || socketRef.current?.readyState !== WebSocket.OPEN) {
      setReconnectDetail("WebSocket is disconnected");
      scheduleReconnectAttempt();
      return;
    }

    dispatch({ type: "reconnectAttemptStarted" });
    setReconnectDetail("Reconnecting...");
    send(stateRef.current.lastConnectCommand);
  };

  const tickReconnectLoop = () => {
    const current = stateRef.current;
    if (!current.reconnectActive || current.reconnectAttemptInFlight) {
      return;
    }

    if (Date.now() >= current.reconnectNextAt) {
      attemptReconnect();
      return;
    }

    updateReconnectCountdown(current.reconnectNextAt);
  };

  const startReconnectLoop = (message = "MQTT Shark will try to reconnect automatically.") => {
    if (!stateRef.current.lastConnectCommand) {
      onMissingReconnectCommand();
      return;
    }

    const alreadyActive = stateRef.current.reconnectActive;
    setReconnectMessage(message);
    dispatch({ type: "reconnectStarted" });

    if (!alreadyActive && !stateRef.current.reconnectAttemptInFlight) {
      scheduleReconnectAttempt();
    }

    if (!timerRef.current) {
      timerRef.current = window.setInterval(tickReconnectLoop, 1000);
    }
  };

  const markReconnectAttemptFailed = (message) => {
    if (!stateRef.current.reconnectActive) {
      return;
    }

    scheduleReconnectAttempt();
    setReconnectDetail(`${message}. Next attempt in 5s`);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    reconnectMessage,
    reconnectDetail,
    attemptReconnect,
    markReconnectAttemptFailed,
    setReconnectDetail,
    startReconnectLoop,
    stopReconnectLoop
  };
};
