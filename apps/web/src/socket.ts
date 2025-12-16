import { io, Socket } from "socket.io-client";

// In production (behind Caddy), same-origin is perfect (no CORS hassle).
export const socket: Socket = io(undefined, {
  path: "/socket.io",
  transports: ["websocket"]
});
