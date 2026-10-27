'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// LiveKit is ~110 KB of client JS; split it out so text channels don't download it.
export const VoiceRoomLoader = dynamic(
  () => import('@/components/voice/voice-room').then((m) => m.VoiceRoom),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  },
);
