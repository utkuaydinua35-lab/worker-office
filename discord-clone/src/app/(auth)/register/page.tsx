import { RegisterForm } from '@/components/auth/register-form';
import { registrationCodeRequired } from '@/lib/registration';

// Read REGISTRATION_CODE at request time, not at build time.
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold">Bir hesap oluştur</h1>
      <RegisterForm requiresCode={registrationCodeRequired()} />
    </>
  );
}
