import { dispose } from '@livekit/rtc-node';

import { ensureBotUser } from '@/bot/bot-user';
import { DiscordCloneMusicService } from '@/bot/music-service';
import { setMusicService } from '@/lib/music/bridge';

/**
 * Starts the music bot inside the custom server process. It's a background
 * service with no port of its own: commands reach it through the bridge, and
 * it talks to LiveKit as an ordinary (bot) participant.
 */
export async function startMusicBot() {
  const service = new DiscordCloneMusicService(await ensureBotUser());
  setMusicService(service);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await service.shutdown().catch(() => {});
    await dispose().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  return service;
}
