/**
 * useInstallPrompt.js
 *
 * Captures the browser's beforeinstallprompt event so the app can
 * show a custom "Add to Home Screen" prompt at the right moment.
 *
 * Returns:
 *   installPrompt  — the deferred event object, or null if unavailable
 *   triggerInstall — () => Promise<'accepted'|'dismissed'|'unavailable'>
 *   clearPrompt    — () => void — call after the user chooses "Never"
 */

import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault(); // suppress the default browser prompt
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return 'unavailable';
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    return outcome; // 'accepted' | 'dismissed'
  };

  const clearPrompt = () => setInstallPrompt(null);

  return { installPrompt, triggerInstall, clearPrompt };
}
