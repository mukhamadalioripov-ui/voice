import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { prisma } from "./prisma.js";

type ClientState = {
  userId: string;
  nickname: string;
};

const stateBySocket = new Map<string, ClientState>();

export function attachSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true }
  });

  io.on("connection", (socket) => {
    socket.on("session:attach", async (payload, cb) => {
      const userId = String(payload?.userId ?? "");
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return cb?.({ ok: false, error: "NO_USER" });

      stateBySocket.set(socket.id, { userId: user.id, nickname: user.nickname });
      cb?.({ ok: true, user: { id: user.id, nickname: user.nickname } });
    });

    socket.on("chat:send", async (payload, cb) => {
      const st = stateBySocket.get(socket.id);
      if (!st) return cb?.({ ok: false, error: "NO_SESSION" });

      const content = String(payload?.content ?? "").trim();
      const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

      if (!content && attachments.length === 0) {
        return cb?.({ ok: false, error: "EMPTY" });
      }
      if (content.length > 2000) {
        return cb?.({ ok: false, error: "TOO_LONG" });
      }

      const msg = await prisma.message.create({
        data: {
          content: content || "",
          authorId: st.userId,
          attachments: {
            create: attachments.map((a: any) => ({
              key: String(a.key),
              url: String(a.url),
              filename: String(a.filename),
              mime: String(a.mime),
              size: Number(a.size)
            }))
          }
        },
        include: { author: true, attachments: true }
      });

      io.emit("chat:newMessage", { message: msg });
      cb?.({ ok: true, message: msg });
    });

    socket.on("disconnect", () => {
      stateBySocket.delete(socket.id);
    });
  });

  return io;
}
