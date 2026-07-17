'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA install button. Registers the service worker, captures Chrome's
 * beforeinstallprompt, and shows an install action when the browser allows
 * it. Hidden when already installed or unsupported (e.g. iOS Safari uses
 * Share → Add to Home Screen instead).
 */
export function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failure only affects installability, never the app.
      });
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') setDeferredPrompt(null);
      }}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-primary hover:text-primary"
    >
      <Download size={13} aria-hidden />
      Install app
    </button>
  );
}
