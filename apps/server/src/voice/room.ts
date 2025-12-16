import * as mediasoup from "mediasoup";
import type {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  RtpParameters
} from "mediasoup/node/lib/types.js";

type Peer = {
  socketId: string;
  userId: string;
  nickname: string;

  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;

  producers: Map<string, Producer>; // producer.id -> Producer
  consumers: Map<string, Consumer>; // consumer.id -> Consumer
};

export class VoiceRoom {
  private worker!: Worker;
  private router!: Router;
  private peers = new Map<string, Peer>(); // socketId -> peer

  async init(opts: {
    listenIp: string;
    announcedIp: string;
    rtcMinPort: number;
    rtcMaxPort: number;
  }) {
    this.worker = await mediasoup.createWorker({
      rtcMinPort: opts.rtcMinPort,
      rtcMaxPort: opts.rtcMaxPort
    });

    this.worker.on("died", () => {
      console.error("mediasoup worker died, exiting in 2s...");
      setTimeout(() => process.exit(1), 2000);
    });

    this.router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2
        }
      ]
    });
  }

  getRtpCapabilities(): RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  join(socketId: string, user: { userId: string; nickname: string }) {
    if (this.peers.has(socketId)) return;

    this.peers.set(socketId, {
      socketId,
      userId: user.userId,
      nickname: user.nickname,
      producers: new Map(),
      consumers: new Map()
    });
  }

  leave(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) return;

    for (const c of peer.consumers.values()) c.close();
    for (const p of peer.producers.values()) p.close();

    peer.sendTransport?.close();
    peer.recvTransport?.close();

    this.peers.delete(socketId);
  }

  listPeers() {
    return [...this.peers.values()].map((p) => ({
      socketId: p.socketId,
      userId: p.userId,
      nickname: p.nickname
    }));
  }

  async createTransport(socketId: string, direction: "send" | "recv", opts: any) {
    const peer = this.mustPeer(socketId);

    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: opts.listenIp, announcedIp: opts.announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    });

    transport.on("dtlsstatechange", (state) => {
      if (state === "closed") transport.close();
    });

    if (direction === "send") peer.sendTransport = transport;
    else peer.recvTransport = transport;

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    };
  }

  async connectTransport(socketId: string, transportId: string, dtlsParameters: DtlsParameters) {
    const transport = this.findTransport(socketId, transportId);
    await transport.connect({ dtlsParameters });
  }

  async produce(socketId: string, transportId: string, kind: "audio", rtpParameters: RtpParameters) {
    const peer = this.mustPeer(socketId);
    const transport = this.findTransport(socketId, transportId);

    const producer = await transport.produce({ kind, rtpParameters });
    peer.producers.set(producer.id, producer);

    producer.on("transportclose", () => peer.producers.delete(producer.id));
    return { id: producer.id };
  }

  getProducersForNewPeer(socketId: string) {
    // all producers from other peers
    const ids: { producerId: string; nickname: string }[] = [];
    for (const [sid, peer] of this.peers) {
      if (sid === socketId) continue;
      for (const producer of peer.producers.values()) {
        ids.push({ producerId: producer.id, nickname: peer.nickname });
      }
    }
    return ids;
  }

  async consume(socketId: string, producerId: string, rtpCapabilities: RtpCapabilities) {
    const peer = this.mustPeer(socketId);
    const recvTransport = peer.recvTransport;
    if (!recvTransport) throw new Error("NO_RECV_TRANSPORT");

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error("CANNOT_CONSUME");
    }

    const consumer = await recvTransport.consume({
      producerId,
      rtpCapabilities,
      paused: true
    });

    peer.consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
    consumer.on("producerclose", () => {
      peer.consumers.delete(consumer.id);
      consumer.close();
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    };
  }

  async resumeConsumer(socketId: string, consumerId: string) {
    const peer = this.mustPeer(socketId);
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new Error("NO_CONSUMER");
    await consumer.resume();
  }

  private mustPeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) throw new Error("NO_PEER");
    return peer;
  }

  private findTransport(socketId: string, transportId: string) {
    const peer = this.mustPeer(socketId);
    const candidates = [peer.sendTransport, peer.recvTransport].filter(Boolean) as WebRtcTransport[];
    const t = candidates.find((x) => x.id === transportId);
    if (!t) throw new Error("NO_TRANSPORT");
    return t;
  }
}
