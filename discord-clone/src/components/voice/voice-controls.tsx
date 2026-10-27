'use client';

import { useLocalParticipant, useParticipantAttributes, useTrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { SERVER_MUTED_ATTRIBUTE } from '@/lib/voice-attributes';

interface VoiceControlsProps {
  serverId: string;
  onDeviceError: (message: string) => void;
}

const deviceError = (what: string) => `${what} başlatılamadı. Tarayıcı izinlerini kontrol et.`;

export function VoiceControls({ serverId, onDeviceError }: VoiceControlsProps) {
  const router = useRouter();
  const { localParticipant } = useLocalParticipant();
  const { attributes } = useParticipantAttributes({ participant: localParticipant });
  const serverMuted = attributes?.[SERVER_MUTED_ATTRIBUTE] === '1';

  const mic = useTrackToggle({
    source: Track.Source.Microphone,
    onDeviceError: () => onDeviceError(deviceError('Mikrofon')),
  });
  const camera = useTrackToggle({
    source: Track.Source.Camera,
    onDeviceError: () => onDeviceError(deviceError('Kamera')),
  });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: 'exclude' },
    // Cancelling the browser's picker also lands here; that isn't worth an error.
    onDeviceError: (err) => {
      if (err?.name !== 'NotAllowedError') onDeviceError(deviceError('Ekran paylaşımı'));
    },
  });

  const micOn = mic.enabled && !serverMuted;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#1e1f22] px-4 py-3">
      <ControlButton
        label={serverMuted ? 'Sunucuda susturuldun' : micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
        active={micOn}
        disabled={mic.pending || serverMuted}
        onClick={() => void mic.toggle()}
        warn={!micOn}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </ControlButton>
      <ControlButton
        label={camera.enabled ? 'Kamerayı kapat' : 'Kamerayı aç'}
        active={camera.enabled}
        disabled={camera.pending}
        onClick={() => void camera.toggle()}
      >
        {camera.enabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </ControlButton>
      <ControlButton
        label={screen.enabled ? 'Paylaşımı durdur' : 'Ekranını paylaş'}
        active={screen.enabled}
        disabled={screen.pending}
        onClick={() => void screen.toggle()}
      >
        {screen.enabled ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
      </ControlButton>
      <button
        type="button"
        title="Bağlantıyı kes"
        aria-label="Bağlantıyı kes"
        // Navigating away unmounts LiveKitRoom, which disconnects.
        onClick={() => router.push(`/servers/${serverId}`)}
        className="flex h-11 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}

function ControlButton({
  label,
  active,
  warn,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  warn?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'bg-foreground text-background' : 'bg-secondary hover:bg-secondary/70',
        warn && 'text-destructive',
      )}
    >
      {children}
    </button>
  );
}
