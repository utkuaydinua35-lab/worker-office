'use client';

import { useParticipants, useTracks, VideoTrack } from '@livekit/components-react';
import type { MemberRole } from '@prisma/client';
import { Track } from 'livekit-client';
import { MonitorUp } from 'lucide-react';
import { useState } from 'react';

import { ParticipantCard } from '@/components/voice/participant-card';
import { cn } from '@/lib/utils';

interface VoiceStageProps {
  serverId: string;
  currentUser: { id: string; role: MemberRole; isOwner: boolean };
}

/** Participant grid; when someone shares their screen it takes the stage and cards shrink to a strip. */
export function VoiceStage({ serverId, currentUser }: VoiceStageProps) {
  const participants = useParticipants();
  const screenShares = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const [focusedSid, setFocusedSid] = useState<string | null>(null);

  const focused =
    screenShares.find((t) => t.publication.trackSid === focusedSid) ?? screenShares[0] ?? null;

  const cards = participants.map((p) => (
    <ParticipantCard
      key={p.identity}
      participant={p}
      serverId={serverId}
      currentUser={currentUser}
      compact={!!focused}
    />
  ));

  if (!focused) {
    return (
      <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-y-auto p-4">
        {cards}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
        <VideoTrack trackRef={focused} className="h-full w-full object-contain" />
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs">
          <MonitorUp className="h-3.5 w-3.5" />
          {focused.participant.name || focused.participant.identity} ekranını paylaşıyor
        </span>
      </div>

      {screenShares.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {screenShares.map((t) => (
            <button
              key={t.publication.trackSid}
              type="button"
              onClick={() => setFocusedSid(t.publication.trackSid)}
              className={cn(
                'relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-black',
                t === focused && 'ring-2 ring-primary',
              )}
            >
              <VideoTrack trackRef={t} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 gap-2 overflow-x-auto">{cards}</div>
    </div>
  );
}
