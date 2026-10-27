'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { Button } from '@/components/ui/button';

export function SignOutButton() {
  return (
    <Button variant="destructive" size="sm" onClick={() => void signOut({ callbackUrl: '/login' })}>
      <LogOut className="h-4 w-4" />
      Çıkış Yap
    </Button>
  );
}
