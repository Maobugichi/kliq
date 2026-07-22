// socket.ts — new file, likely in your server bootstrap folder
import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import cookie from "cookie";
import { verifyAccessToken } from "./utils/token.util.js";
import { allowedOrigins } from "./config/cors.config.js";

let io: SocketIOServer;

export const initSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      if (!rawCookie) return next(new Error("No cookie"));

      const parsed = cookie.parse(rawCookie);
      const token = parsed.accessToken;
      if (!token) return next(new Error("No access token"));

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
  });

  return io;
};

export const getIO = () => io;