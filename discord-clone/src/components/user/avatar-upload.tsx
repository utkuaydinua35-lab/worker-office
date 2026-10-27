'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user/user-avatar';
import type { PublicProfile } from '@/lib/profile';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/validators';

interface AvatarUploadProps {
  profile: PublicProfile;
  onUpdated: (profile: PublicProfile) => void;
}

export function AvatarUpload({ profile, onUpdated }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: 'POST' | 'DELETE', body?: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/avatar', { method, body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Yükleme başarısız');
      onUpdated(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükleme başarısız');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    // Mirrors the server check for a fast error; the server stays authoritative.
    if (file.size > AVATAR_MAX_BYTES) {
      setError('Dosya en fazla 2 MB olabilir');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    void send('POST', form);
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        status={profile.status}
        className="h-20 w-20 text-2xl"
      />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Avatarı Değiştir
          </Button>
          {profile.avatarUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void send('DELETE')}
            >
              Kaldır
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG, WEBP veya GIF — en fazla 2 MB</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(AVATAR_MIME_TYPES).join(',')}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
