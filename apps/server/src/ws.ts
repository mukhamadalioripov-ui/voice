import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { prisma } from "./prisma.js";
import { voiceRoom } from "./voice/index.js"; // добавь импорт сверху

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

      if (!content && attachments.length === 0) return cb?.({ ok: false, error: "EMPTY" });
      if (content.length > 2000) return cb?.({ ok: false, error: "TOO_LONG" });

      const msg = await prisma.message.create({
        data: {
          content: content || "",
          authorId: st.userId,
          attachments: {
            create: attachments.map((a: any) => ({
              key: String(a.key),
              filename: String(a.filename),
              mime: String(a.mime),
              size: Number(a.size),
              url: "" // deprecated, will remove after front is updated (kept for now to avoid another migration)
            }))
          }
        },
        include: { author: true, attachments: true }
      });

      io.emit("chat:newMessage", { message: msg });
      cb?.({ ok: true, message: msg });
    });

    socket.on("disconnect", () => stateBySocket.delete(socket.id));
  });
socket.on("voice:join", async (_payload, cb) => {
  const st = stateBySocket.get(socket.id);
  if (!st) return cb?.({ ok: false, error: "NO_SESSION" });

  voiceRoom.join(socket.id, { userId: st.userId, nickname: st.nickname });

  cb?.({ ok: true, peers: voiceRoom.listPeers(), rtpCapabilities: voiceRoom.getRtpCapabilities() });
  socket.broadcast.emit("voice:peerJoined", { socketId: socket.id, nickname: st.nickname });
});

socket.on("voice:leave", (_payload, cb) => {
  voiceRoom.leave(socket.id);
  cb?.({ ok: true });
  socket.broadcast.emit("voice:peerLeft", { socketId: socket.id });
});

socket.on("voice:createTransport", async (payload, cb) => {
  try {
    const direction = payload?.direction === "send" ? "send" : "recv";
    const params = await voiceRoom.createTransport(socket.id, direction, {
      listenIp: process.env.MEDIASOUP_LISTEN_IP,
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP
    });
    cb?.({ ok: true, params });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

socket.on("voice:connectTransport", async (payload, cb) => {
  try {
    await voiceRoom.connectTransport(socket.id, String(payload.transportId), payload.dtlsParameters);
    cb?.({ ok: true });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

socket.on("voice:produce", async (payload, cb) => {
  try {
    const { id } = await voiceRoom.produce(
      socket.id,
      String(payload.transportId),
      "audio",
      payload.rtpParameters
    );
    cb?.({ ok: true, id });

    // Tell everyone else there is a new producer to consume.
    socket.broadcast.emit("voice:newProducer", { producerId: id, socketId: socket.id });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

socket.on("voice:getProducers", (_payload, cb) => {
  try {
    const producers = voiceRoom.getProducersForNewPeer(socket.id);
    cb?.({ ok: true, producers });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

socket.on("voice:consume", async (payload, cb) => {
  try {
    const params = await voiceRoom.consume(
      socket.id,
      String(payload.producerId),
      payload.rtpCapabilities
    );
    cb?.({ ok: true, params });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

socket.on("voice:resume", async (payload, cb) => {
  try {
    await voiceRoom.resumeConsumer(socket.id, String(payload.consumerId));
    cb?.({ ok: true });
  } catch (e: any) {
    cb?.({ ok: false, error: String(e?.message ?? e) });
  }
});

  return io;
}
