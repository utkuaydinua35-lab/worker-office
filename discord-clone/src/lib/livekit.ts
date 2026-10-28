import { RoomServiceClient, TrackSource, type VideoGrant } from 'livekit-server-sdk';

/**
 * LiveKit settings. NEXT_PUBLIC_LIVEKIT_URL is the WebSocket URL browsers
 * connect to (wss://hasbihal.example.com behind the reverse proxy, or
 * ws://localhost:7880 for `livekit-server --dev`). LIVEKIT_INTERNAL_URL, when
 * set, is how this server itself (room API, music bot) reaches LiveKit
 * without going out through the proxy, e.g. ws://127.0.0.1:7880.
 */
export function livekitConfig() {
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!wsUrl || !apiKey || !apiSecret) return null;
  const internalWsUrl = process.env.LIVEKIT_INTERNAL_URL || wsUrl;
  return { wsUrl, internalWsUrl, apiKey, apiSecret, httpUrl: internalWsUrl.replace(/^ws/, 'http') };
}

export function roomService() {
  const cfg = livekitConfig();
  return cfg ? new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret) : null;
}

/** Room name for a voice channel. Channel ids are UUIDs, unique across servers. */
export const voiceRoomName = (channelId: string) => channelId;

/** Disconnects a user from the given voice channels (left or kicked). Best effort. */
export async function removeFromVoiceRooms(userId: string, voiceChannelIds: string[]) {
  const rooms = roomService();
  if (!rooms) return;
  await Promise.all(
    voiceChannelIds.map((id) => rooms.removeParticipant(voiceRoomName(id), userId).catch(() => {})),
  );
}

/** Ends the given voice channels' rooms for everyone (channel or server deleted). Best effort. */
export async function closeVoiceRooms(voiceChannelIds: string[]) {
  const rooms = roomService();
  if (!rooms) return;
  await Promise.all(voiceChannelIds.map((id) => rooms.deleteRoom(voiceRoomName(id)).catch(() => {})));
}

// Participant attributes (set in the token, updated by the mute API) that
// other clients read: the server-mute icon, and who may moderate whom.
export { OWNER_ATTRIBUTE, ROLE_ATTRIBUTE, SERVER_MUTED_ATTRIBUTE } from '@/lib/voice-attributes';

const ALL_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

/**
 * Publish permissions. A server-muted member keeps camera and screen share
 * but LiveKit itself refuses their microphone, so muting doesn't depend on
 * the client behaving.
 */
export function voicePermission(serverMuted: boolean) {
  return {
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: serverMuted
      ? ALL_SOURCES.filter((s) => s !== TrackSource.MICROPHONE)
      : ALL_SOURCES,
  } satisfies Partial<VideoGrant>;
}
