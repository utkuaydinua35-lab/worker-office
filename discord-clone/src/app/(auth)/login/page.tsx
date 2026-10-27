import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <>
      <h1 className="text-center text-2xl font-bold">Tekrar hoş geldin!</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">Seni tekrar gördüğümüze sevindik!</p>
      {/* useSearchParams needs a Suspense boundary under the App Router. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
