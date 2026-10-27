export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary/80 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-xl">{children}</div>
    </main>
  );
}
