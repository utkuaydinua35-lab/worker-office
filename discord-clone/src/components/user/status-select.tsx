'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { UserStatusValue } from '@/lib/validators';

export const STATUS_OPTIONS: { value: UserStatusValue; label: string; dot: string }[] = [
  { value: 'ONLINE', label: 'Çevrimiçi', dot: 'bg-status-online' },
  { value: 'IDLE', label: 'Boşta', dot: 'bg-status-idle' },
  { value: 'DND', label: 'Rahatsız Etmeyin', dot: 'bg-status-dnd' },
  { value: 'OFFLINE', label: 'Görünmez', dot: 'bg-status-offline' },
];

interface StatusSelectProps {
  value: UserStatusValue;
  onChange: (value: UserStatusValue) => void;
  disabled?: boolean;
}

export function StatusSelect({ value, onChange, disabled }: StatusSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UserStatusValue)} disabled={disabled}>
      <SelectTrigger id="status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', opt.dot)} />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
