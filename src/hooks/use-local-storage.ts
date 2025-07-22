
"use client";

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

// A robust custom hook to manage state in localStorage.
// This hook correctly handles server-side rendering (SSR) by delaying
// the localStorage read until the component has mounted on the client.
function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
    
  // The state is initialized with a function, which is only executed on the client-side.
  // This prevents SSR errors and ensures we read from localStorage only when available.
  const [storedValue, setStoredValue] = useState<T>(() => {
    // This part does not run on the server.
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  });

  // The 'set' function updates both the React state and localStorage.
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      try {
        // Allow value to be a function so we have the same API as useState
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        // Save state
        setStoredValue(valueToStore);
        // Save to local storage
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key “${key}”:`, error);
      }
    },
    [key, storedValue]
  );
  
  // This effect listens for changes to the same key from other tabs/windows.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key === key) {
            try {
                if (e.newValue) {
                    setStoredValue(JSON.parse(e.newValue));
                }
            } catch (error) {
                console.warn(`Error parsing storage change for key “${key}”:`, error)
            }
        }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);


  return [storedValue, setValue];
}

export default useLocalStorage;
