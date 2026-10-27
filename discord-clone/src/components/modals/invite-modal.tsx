'use client';

import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/client-api';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: { id: string; name: string; inviteCode: string };
  canRegenerate: boolean;
}

export function InviteModal({ open, onOpenChange, server, canRegenerate }: InviteModalProps) {
  const [code, setCode] = useState(server.inviteCode);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setCode(server.inviteCode), [server.inviteCode]);

  const link = `${origin}/invite/${code}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ inviteCode: string }>(`/api/servers/${server.id}/invite-code`, {
        method: 'POST',
      });
      setCode(res.inviteCode);
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
          <DialogTitle>Arkadaşlarını {server.name} sunucusuna davet et</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite-link">Sunucu davet bağlantısı</Label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button type="button" size="icon" onClick={() => void copy()} aria-label="Kopyala">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {canRegenerate && (
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:underline disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Yeni bağlantı oluştur (eskisi geçersiz olur)
            </button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
