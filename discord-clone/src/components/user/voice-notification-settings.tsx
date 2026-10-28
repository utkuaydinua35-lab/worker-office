'use client';

import { useEffect, useState } from 'react';

import { useUnread } from '@/components/providers/unread-provider';
import { useVoice } from '@/components/providers/voice-provider';
import { Button } from '@/components/ui/button';

/** "KeyV" → "V", "Backquote" → "`" — readable names for the key picker. */
function keyLabel(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    Backquote: '`',
    Space: 'Boşluk',
    CapsLock: 'Caps Lock',
    ShiftLeft: 'Sol Shift',
    ShiftRight: 'Sağ Shift',
    ControlLeft: 'Sol Ctrl',
    ControlRight: 'Sağ Ctrl',
    AltLeft: 'Sol Alt',
    AltRight: 'Sağ Alt',
  };
  return named[code] ?? code;
}

const NOTIFICATION_HINT: Record<string, string> = {
  denied: 'Tarayıcı bildirimleri engelliyor. Adres çubuğundaki site ayarlarından izin ver.',
  unsupported: 'Bu tarayıcı bildirimleri desteklemiyor.',
};

export function VoiceNotificationSettings() {
  const voice = useVoice();
  const unread = useUnread();
  const [capturing, setCapturing] = useState(false);

  // Next key pressed becomes the push-to-talk key; Esc cancels.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setCapturing(false);
      if (e.code !== 'Escape') voice.setPushToTalk({ ...voice.pushToTalk, key: e.code });
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing, voice]);

  return (
    <section className="mt-10 space-y-6">
      <h2 className="text-lg font-semibold">Ses ve Bildirimler</h2>

      <div className="space-y-2 rounded-lg bg-[#2b2d31] p-4">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Masaüstü bildirimleri</span>
            <span className="block text-sm text-muted-foreground">
              Biri senden @bahsettiğinde ya da sana direkt mesaj attığında bildirim gelir.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={unread.notifications === 'on'}
            disabled={unread.notifications === 'denied' || unread.notifications === 'unsupported'}
            onChange={(e) => void unread.setNotificationsEnabled(e.target.checked)}
          />
        </label>
        {NOTIFICATION_HINT[unread.notifications] && (
          <p className="text-xs text-destructive">{NOTIFICATION_HINT[unread.notifications]}</p>
        )}
      </div>

      <div className="space-y-3 rounded-lg bg-[#2b2d31] p-4">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Bas-konuş</span>
            <span className="block text-sm text-muted-foreground">
              Mikrofonun yalnızca tuşa basılı tutarken açık olur. Hasbihal sekmesi açık ve seçiliyken çalışır.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={voice.pushToTalk.enabled}
            onChange={(e) => voice.setPushToTalk({ ...voice.pushToTalk, enabled: e.target.checked })}
          />
        </label>
        {voice.pushToTalk.enabled && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Tuş:</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCapturing(true)}>
              {capturing ? 'Bir tuşa bas… (Esc: vazgeç)' : keyLabel(voice.pushToTalk.key)}
            </Button>
            {voice.talking && <span className="text-status-online">Konuşuyorsun</span>}
          </div>
        )}
      </div>
    </section>
  );
}
