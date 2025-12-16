import { VoiceRoom } from "./room.js";
import { env } from "../env.js";

export const voiceRoom = new VoiceRoom();

export async function initVoice() {
  await voiceRoom.init({
    listenIp: env.MEDIASOUP_LISTEN_IP,
    announcedIp: env.MEDIASOUP_ANNOUNCED_IP,
    rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT ?? 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT ?? 40100)
  });
}
