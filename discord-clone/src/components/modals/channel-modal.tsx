'use client';

import { Hash, Loader2, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigateFresh } from '@/hooks/use-navigate-fresh';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { ChannelTypeValue } from '@/lib/validators';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
} & (
  | { mode: 'create'; defaultType?: ChannelTypeValue }
  | { mode: 'edit'; channel: { id: string; name: string; type: ChannelTypeValue } }
);

const TYPE_OPTIONS = [
  { value: 'TEXT', label: 'Metin', hint: 'Mesaj, görsel ve dosya gönder', Icon: Hash },
  { value: 'VOICE', label: 'Ses', hint: 'Sesli ve görüntülü sohbet et', Icon: Volume2 },
] as const;

export function ChannelModal(props: Props) {
  const { open, onOpenChange, serverId } = props;
  const editing = props.mode === 'edit' ? props.channel : null;
  const defaultType = props.mode === 'create' ? (props.defaultType ?? 'TEXT') : undefined;
  const router = useRouter();
  const navigateFresh = useNavigateFresh();

  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelTypeValue>('TEXT');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setType(editing?.type ?? defaultType ?? 'TEXT');
    setError(null);
  }, [open, editing?.name, editing?.type, defaultType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/channels/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        });
        onOpenChange(false);
        router.refresh();
      } else {
        const channel = await apiFetch<{ id: string }>(`/api/servers/${serverId}/channels`, {
          method: 'POST',
          body: JSON.stringify({ name, type }),
        });
        onOpenChange(false);
        navigateFresh(`/servers/${serverId}/channels/${channel.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const TypeIcon = type === 'VOICE' ? Volume2 : Hash;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Kanalı Düzenle' : 'Kanal Oluştur'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {!editing && (
            <div className="space-y-2">
              <Label>Kanal Türü</Label>
              <div className="space-y-2">
                {TYPE_OPTIONS.map(({ value, label, hint, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md bg-secondary px-3 py-2.5 text-left',
                      type === value ? 'ring-2 ring-primary' : 'hover:bg-secondary/70',
                    )}
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="channel-name">Kanal Adı</Label>
            <div className="relative">
              <TypeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="channel-name"
                className="pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="yeni-kanal"
                autoFocus
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Kaydet' : 'Kanal Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
