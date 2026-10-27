'use client';

import { ImagePlus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { IMAGE_MIME_TYPES } from '@/lib/validators';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | { mode: 'create' }
  | { mode: 'edit'; server: { id: string; name: string; iconUrl: string | null } }
);

/** Create a server, or edit an existing one's name and icon (multipart, so the icon rides along). */
export function ServerFormModal(props: Props) {
  const { open, onOpenChange } = props;
  const editing = props.mode === 'edit' ? props.server : null;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset to the server's current values each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setIcon(null);
    setPreview(editing?.iconUrl ?? null);
    setRemoveIcon(false);
    setError(null);
  }, [open, editing?.name, editing?.iconUrl]);

  useEffect(() => {
    if (!icon) return;
    const url = URL.createObjectURL(icon);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [icon]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('name', name);
    if (icon) form.append('icon', icon);
    if (removeIcon && !icon) form.append('removeIcon', '1');

    try {
      if (editing) {
        await apiFetch(`/api/servers/${editing.id}`, { method: 'PATCH', body: form });
        onOpenChange(false);
        router.refresh();
      } else {
        const created = await apiFetch<{ id: string; firstChannelId: string }>('/api/servers', {
          method: 'POST',
          body: form,
        });
        onOpenChange(false);
        router.push(`/servers/${created.id}/channels/${created.firstChannelId}`);
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Sunucu Ayarları' : 'Sunucunu oluştur'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Sunucunun adını ve simgesini değiştir.'
              : 'Sunucuna bir ad ve simge vererek ona kişilik kat. Bunları daha sonra değiştirebilirsin.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/60 hover:border-primary"
              aria-label="Simge seç"
            >
              {preview && !removeIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-7 w-7 text-muted-foreground" />
              )}
            </button>
            {preview && !removeIcon && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setIcon(null);
                  setRemoveIcon(true);
                }}
              >
                Simgeyi kaldır
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={Object.keys(IMAGE_MIME_TYPES).join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setIcon(file);
                  setRemoveIcon(false);
                }
                e.target.value = '';
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="server-name">Sunucu Adı</Label>
            <Input
              id="server-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Harika sunucum"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Kaydet' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
