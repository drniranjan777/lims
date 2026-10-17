'use client';

import { useEffect, useState } from 'react';

/** Chromium's install prompt event (not yet in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser can fire beforeinstallprompt before React mounts, so listen as soon as this module loads.
let deferred: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we offer installation from the account menu instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Register the service worker (production builds only — in development it would cache hot-reloaded bundles). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* the app works without it — installation and the offline page are just unavailable */
  });
}

/** Whether the browser offers installation right now, and a function that shows its install dialog. */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const update = () => setCanInstall(deferred !== null);
    update();
    subscribers.add(update);
    return () => void subscribers.delete(update);
  }, []);
  const install = async () => {
    if (!deferred) return;
    const event = deferred;
    await event.prompt();
    if ((await event.userChoice).outcome === 'accepted') deferred = null;
    notify();
  };
  return { canInstall, install };
}
