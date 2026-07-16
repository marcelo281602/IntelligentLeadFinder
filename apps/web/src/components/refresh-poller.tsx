'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Refreshes server data on an interval while a run is in flight. */
export function RefreshPoller({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
