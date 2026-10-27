'use client';

import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AvatarUpload } from '@/components/user/avatar-upload';
import { StatusSelect } from '@/components/user/status-select';
import type { PublicProfile } from '@/lib/profile';
import type { UserStatusValue } from '@/lib/validators';

type FieldErrors = Partial<Record<'username' | 'bio' | 'customStatus' | 'status', string>>;

export function ProfileSettingsForm({ initialProfile }: { initialProfile: PublicProfile }) {
  const router = useRouter();
  const { update: refreshSession } = useSession();

  const [profile, setProfile] = useState(initialProfile);
  const [username, setUsername] = useState(initialProfile.username);
  const [bio, setBio] = useState(initialProfile.bio ?? '');
  const [customStatus, setCustomStatus] = useState(initialProfile.customStatus ?? '');
  const [status, setStatus] = useState<UserStatusValue>(initialProfile.status);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const dirty =
    username !== profile.username ||
    bio !== (profile.bio ?? '') ||
    customStatus !== (profile.customStatus ?? '') ||
    status !== profile.status;

  async function applyProfile(next: PublicProfile) {
    setProfile(next);
    // Username/avatar live in the JWT; ask NextAuth to re-read them from the DB.
    await refreshSession();
    router.refresh();
  }

  function reset() {
    setUsername(profile.username);
    setBio(profile.bio ?? '');
    setCustomStatus(profile.customStatus ?? '');
    setStatus(profile.status);
    setErrors({});
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);

    // Send only changed fields so the PATCH never clobbers concurrent edits.
    const patch: Record<string, unknown> = {};
    if (username !== profile.username) patch.username = username;
    if (bio !== (profile.bio ?? '')) patch.bio = bio;
    if (customStatus !== (profile.customStatus ?? '')) patch.customStatus = customStatus;
    if (status !== profile.status) patch.status = status;

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.issues) {
          setErrors(
            Object.fromEntries(
              Object.entries(json.issues as Record<string, string[]>).map(([k, v]) => [k, v[0]]),
            ),
          );
        } else if (json.field) {
          setErrors({ [json.field]: json.error });
        }
        setMessage({ kind: 'error', text: json.error ?? 'Kaydedilemedi' });
        return;
      }
      await applyProfile(json);
      setMessage({ kind: 'ok', text: 'Değişiklikler kaydedildi' });
    } catch {
      setMessage({ kind: 'error', text: 'Bağlantı hatası' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-lg bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Profil Fotoğrafı</h2>
        <AvatarUpload profile={profile} onUpdated={(p) => void applyProfile(p)} />
      </section>

      <section className="space-y-5 rounded-lg bg-card p-6">
        <h2 className="text-lg font-semibold">Profil</h2>

        <div className="space-y-2">
          <Label htmlFor="username">Kullanıcı Adı</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            autoComplete="username"
          />
          {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Hakkımda</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            placeholder="Kendinden bahset..."
          />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/190</p>
          {errors.bio && <p className="text-xs text-destructive">{errors.bio}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status">Durum</Label>
            <StatusSelect value={status} onChange={setStatus} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customStatus">Özel Durum</Label>
            <Input
              id="customStatus"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              maxLength={128}
              placeholder="Ne yapıyorsun?"
            />
            {errors.customStatus && (
              <p className="text-xs text-destructive">{errors.customStatus}</p>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {message && (
          <p
            className={
              message.kind === 'ok' ? 'mr-auto text-sm text-status-online' : 'mr-auto text-sm text-destructive'
            }
          >
            {message.text}
          </p>
        )}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={reset}>
          Sıfırla
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Değişiklikleri Kaydet
        </Button>
      </div>
    </form>
  );
}
