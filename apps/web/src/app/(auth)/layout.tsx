import { brand } from '@leadfinder/config';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="header-wash flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-primary">
            {brand.name}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{brand.tagline}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
