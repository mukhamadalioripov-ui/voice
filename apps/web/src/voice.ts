import * as mediasoupClient from "mediasoup-client";
import type { Device } from "mediasoup-client";
import { socket } from "./socket";

export type VoiceState = {
  joined: boolean;
  peers: { socketId: string; nickname: string }[];
};

let device: Device | null = null;
let sendTransport: any = null;
let recvTransport: any = null;
let micProducer: any = null;
const consumers = new Map<string, any>();

function playTrack(track: MediaStreamTrack) {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.srcObject = new MediaStream([track]);
  document.body.appendChild(audio);
  return audio;
}

export async function voiceJoin(setState: (s: Partial<VoiceState>) => void) {
  const ack = await new Promise<any>((resolve) => socket.emit("voice:join", {}, resolve));
  if (!ack?.ok) throw new Error(ack?.error ?? "VOICE_JOIN_FAILED");

  const routerRtpCapabilities = ack.rtpCapabilities;
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities });

  // Create transports
  const sendAck = await new Promise<any>((resolve) =>
    socket.emit("voice:createTransport", { direction: "send" }, resolve)
  );
  if (!sendAck?.ok) throw new Error(sendAck?.error ?? "SEND_TRANSPORT_FAILED");

  sendTransport = device.createSendTransport(sendAck.params);

  sendTransport.on("connect", ({ dtlsParameters }: any, callback: any, errback: any) => {
    socket.emit("voice:connectTransport", { transportId: sendTransport.id, dtlsParameters }, (r: any) =>
      r?.ok ? callback() : errback(r?.error)
    );
  });

  sendTransport.on("produce", ({ kind, rtpParameters }: any, callback: any, errback: any) => {
    socket.emit(
      "voice:produce",
      { transportId: sendTransport.id, kind, rtpParameters },
      (r: any) => (r?.ok ? callback({ id: r.id }) : errback(r?.error))
    );
  });

  const recvAck = await new Promise<any>((resolve) =>
    socket.emit("voice:createTransport", { direction: "recv" }, resolve)
  );
  if (!recvAck?.ok) throw new Error(recvAck?.error ?? "RECV_TRANSPORT_FAILED");

  recvTransport = device.createRecvTransport(recvAck.params);

  recvTransport.on("connect", ({ dtlsParameters }: any, callback: any, errback: any) => {
    socket.emit("voice:connectTransport", { transportId: recvTransport.id, dtlsParameters }, (r: any) =>
      r?.ok ? callback() : errback(r?.error)
    );
  });

  // Start mic
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const track = stream.getAudioTracks()[0];
  micProducer = await sendTransport.produce({ track });

  // Consume existing producers
  const prodAck = await new Promise<any>((resolve) => socket.emit("voice:getProducers", {}, resolve));
  if (prodAck?.ok) {
    for (const p of prodAck.producers as any[]) await consumeProducer(p.producerId);
  }

  // Listen new producers
  socket.on("voice:newProducer", async (p: any) => {
    await consumeProducer(p.producerId);
  });

  setState({ joined: true, peers: ack.peers });
}

async function consumeProducer(producerId: string) {
  if (!device || !recvTransport) return;

  const ack = await new Promise<any>((resolve) =>
    socket.emit("voice:consume", { producerId, rtpCapabilities: device.rtpCapabilities }, resolve)
  );
  if (!ack?.ok) return;

  const { id, kind, rtpParameters } = ack.params;
  const consumer = await recvTransport.consume({ id, producerId, kind, rtpParameters });
  consumers.set(id, consumer);

  const audioEl = playTrack(consumer.track);

  await new Promise<any>((resolve) => socket.emit("voice:resume", { consumerId: id }, resolve));
  consumer.on("transportclose", () => audioEl.remove());
}

export async function voiceLeave(setState: (s: Partial<VoiceState>) => void) {
  try {
    socket.off("voice:newProducer");
    await new Promise<any>((resolve) => socket.emit("voice:leave", {}, resolve));
  } finally {
    for (const c of consumers.values()) c.close();
    consumers.clear();
    micProducer?.close();
    sendTransport?.close();
    recvTransport?.close();
    device = null;
    setState({ joined: false, peers: [] });
  }
}
