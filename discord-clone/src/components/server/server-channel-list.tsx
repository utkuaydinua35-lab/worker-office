'use client';

import { ServerChannel } from '@/components/server/server-channel';
import { ServerSection } from '@/components/server/server-section';
import { useVoicePresence, VoiceChannelMembers } from '@/components/server/voice-channel-members';
import type { ChannelTypeValue } from '@/lib/validators';
import type { VoiceChannelsState } from '@/lib/voice-presence/store';

interface ChannelRef {
  id: string;
  name: string;
  type: ChannelTypeValue;
}

interface ServerChannelListProps {
  serverId: string;
  channels: ChannelRef[];
  canManage: boolean;
  initialVoice: VoiceChannelsState;
}

const SECTIONS = [
  { type: 'TEXT', label: 'Metin Kanalları' },
  { type: 'VOICE', label: 'Ses Kanalları' },
] as const;

/** Text and voice sections; voice channels list who's in them, live. */
export function ServerChannelList({ serverId, channels, canManage, initialVoice }: ServerChannelListProps) {
  const voice = useVoicePresence(serverId, initialVoice);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {SECTIONS.map((section) => (
        <div key={section.type}>
          <ServerSection label={section.label} serverId={serverId} channelType={section.type} canCreate={canManage} />
          <div className="space-y-0.5">
            {channels
              .filter((c) => c.type === section.type)
              .map((channel) => (
                <div key={channel.id}>
                  <ServerChannel serverId={serverId} channel={channel} canManage={canManage} />
                  {channel.type === 'VOICE' && (
                    <VoiceChannelMembers channelId={channel.id} members={voice[channel.id] ?? []} />
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
