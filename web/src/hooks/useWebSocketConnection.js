import { useEffect, useRef } from "react";

export const useWebSocketConnection = ({ url, handlersRef, onUnavailable }) => {
  const socketRef = useRef(null);

  const send = (message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      onUnavailable();
      return;
    }

    socketRef.current.send(JSON.stringify(message));
  };

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", (event) => handlersRef.current.onOpen?.(event));
    socket.addEventListener("close", (event) => handlersRef.current.onClose?.(event));
    socket.addEventListener("error", (event) => handlersRef.current.onError?.(event));
    socket.addEventListener("message", (event) => handlersRef.current.onMessage?.(event));

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [handlersRef, url]);

  return {
    socketRef,
    send
  };
};
