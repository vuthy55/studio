
"use client";

import { useState, useEffect } from 'react';

/**
 * A custom hook to determine the user's online status.
 * It uses the browser's `navigator.onLine` property and listens for
 * 'online' and 'offline' events to provide a real-time status.
 *
 * @returns {boolean} `true` if the browser is online, `false` otherwise.
 */
export function useOnlineStatus(): boolean {
  // Initialize state from navigator.onLine, defaulting to false if window is not available (SSR)
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : false
  );

  useEffect(() => {
    // This effect should only run on the client
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function to remove event listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
