import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { brand } from '@leadfinder/config';
import { signOut } from '@/actions/auth';
import { requireSuperAdmin } from '@/lib/admin';

export const metadata = { title: 'Platform Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-primary"
            >
              <ShieldCheck size={18} aria-hidden />
              {brand.name} Admin
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium" aria-label="Admin">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-canvas hover:text-primary"
              >
                Platform
              </Link>
              <Link
                href="/admin/clients"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-canvas hover:text-primary"
              >
                Clients
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-ink-soft hover:text-primary hover:underline">
              ← App
            </Link>
            <span className="hidden max-w-[18ch] truncate text-ink-faint sm:block">
              {session.email}
            </span>
            <form action={signOut}>
              <button type="submit" className="text-ink-soft hover:text-primary hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-3 text-xs text-ink-faint">
        Super-admin actions are fully audited. Client workspace data stays isolated — this console
        shows operational metadata and manages plans only.
      </footer>
    </div>
  );
}
