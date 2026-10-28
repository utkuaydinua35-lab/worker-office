'use client';

import { Loader2 } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerSchema, type RegisterInput } from '@/lib/validators';

type Errors = Partial<Record<keyof RegisterInput | 'form', string>>;

export function RegisterForm({ requiresCode }: { requiresCode: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<RegisterInput>({ username: '', email: '', password: '', registrationCode: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const set = (key: keyof RegisterInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Same schema as the API, so the client shows the server's messages early.
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors({ username: fe.username?.[0], email: fe.email?.[0], password: fe.password?.[0] });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.field ? { [json.field]: json.error } : { form: json.error ?? 'Kayıt başarısız' });
        return;
      }

      const login = await signIn('credentials', {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
      if (!login || login.error) {
        router.push('/login');
        return;
      }
      router.push('/');
    } catch {
      setErrors({ form: 'Bağlantı hatası' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">E-posta</Label>
        <Input id="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Kullanıcı Adı</Label>
        <Input id="username" autoComplete="username" value={values.username} onChange={set('username')} />
        {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>
      {requiresCode && (
        <div className="space-y-2">
          <Label htmlFor="registrationCode">Kayıt Kodu</Label>
          <Input
            id="registrationCode"
            autoComplete="off"
            value={values.registrationCode}
            onChange={set('registrationCode')}
            placeholder="Sunucu sahibinden al"
          />
          {errors.registrationCode && <p className="text-xs text-destructive">{errors.registrationCode}</p>}
        </div>
      )}
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Devam Et
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Zaten bir hesabın var mı?
        </Link>
      </p>
    </form>
  );
}
