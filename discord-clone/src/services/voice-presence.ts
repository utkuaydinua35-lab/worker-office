import { TrackSource, type ParticipantInfo } from 'livekit-server-sdk';

import { db } from '@/lib/db';
import { livekitConfig, roomService } from '@/lib/livekit';
import { emitVoiceState } from '@/lib/socket/emit';
import { BOT_ATTRIBUTE, SERVER_MUTED_ATTRIBUTE } from '@/lib/voice-attributes';
import {
  voiceStateStore,
  type VoiceChannelsState,
  type VoiceMember,
} from '@/lib/voice-presence/store';

// LiveKit is the source of truth for who's in a room: a client saying "I
// joined" proves nothing. Poll it, and poll sooner when someone pokes.
const POLL_MS = 4000;
const POKE_DEBOUNCE_MS = 300;

function toMember(p: ParticipantInfo): VoiceMember {
  let avatarUrl: string | null = null;
  try {
    const value = JSON.parse(p.metadata || '{}').avatarUrl;
    avatarUrl = typeof value === 'string' ? value : null;
  } catch {
    // not our metadata
  }
  const mic = p.tracks.find((t) => t.source === TrackSource.MICROPHONE);
  return {
    id: p.identity,
    name: p.name || p.identity,
    avatarUrl,
    isBot: p.attributes[BOT_ATTRIBUTE] === '1',
    micMuted: !mic || mic.muted,
    serverMuted: p.attributes[SERVER_MUTED_ATTRIBUTE] === '1',
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let pokeTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;
// Log an outage once, not every POLL_MS, and say when it's over.
let unreachable = false;

async function poll() {
  const rooms = roomService();
  if (!rooms) return;
  // One poll at a time; a poke during one runs another right after.
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const active = (await rooms.listRooms()).filter((r) => r.numParticipants > 0);
    const channels = active.length
      ? await db.channel.findMany({
          where: { id: { in: active.map((r) => r.name) }, type: 'VOICE' },
          select: { id: true, serverId: true },
        })
      : [];

    const next = new Map<string, VoiceChannelsState>();
    await Promise.all(
      channels.map(async (channel) => {
        const participants = await rooms.listParticipants(channel.id).catch(() => []);
        if (participants.length === 0) return;
        const members = participants
          .map(toMember)
          // Bot last, then by name, like Discord.
          .sort((a, b) => Number(a.isBot) - Number(b.isBot) || a.name.localeCompare(b.name, 'tr'));
        const state = next.get(channel.serverId) ?? {};
        state[channel.id] = members;
        next.set(channel.serverId, state);
      }),
    );

    // Broadcast only servers whose picture changed, including ones that emptied out.
    const store = voiceStateStore();
    for (const serverId of new Set([...store.keys(), ...next.keys()])) {
      const before = JSON.stringify(store.get(serverId) ?? {});
      const after = next.get(serverId) ?? {};
      if (before === JSON.stringify(after)) continue;
      if (Object.keys(after).length) store.set(serverId, after);
      else store.delete(serverId);
      emitVoiceState(serverId, after);
    }
    if (unreachable) {
      unreachable = false;
      console.info('[voice-presence] LiveKit bağlantısı geri geldi');
    }
  } catch (err) {
    if (!unreachable) {
      unreachable = true;
      console.warn(
        `[voice-presence] LiveKit'e ulaşılamıyor (${livekitConfig()?.httpUrl}): ${(err as Error).message}. ` +
          'livekit-server çalışıyor mu? Ses kanalı listeleri o gelene kadar güncellenmeyecek.',
      );
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      void poll();
    }
  }
}

/** Re-check soon: someone joined, left or toggled their mic. */
export function pokeVoicePresence() {
  if (pokeTimer) return;
  pokeTimer = setTimeout(() => {
    pokeTimer = null;
    void poll();
  }, POKE_DEBOUNCE_MS);
}

export function startVoicePresence() {
  if (timer || !roomService()) return;
  timer = setInterval(() => void poll(), POLL_MS);
  void poll();
}
