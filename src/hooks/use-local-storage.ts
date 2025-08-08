

"use client";

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

// A robust custom hook to manage state in localStorage.
// This hook correctly handles server-side rendering (SSR) by delaying
// the localStorage read until the component has mounted on the client.
function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
    
  const [storedValue, setStoredValue] = useState<T>(() => {
    // This part now only runs on the client.
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      // Return parsed item or initialValue, ensuring no null is returned unless intended by T.
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  });

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
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
        if (e.key === key && e.newValue !== null) {
            try {
                setStoredValue(JSON.parse(e.newValue));
            } catch (error) {
                console.warn(`Error parsing storage change for key “${key}”:`, error)
            }
        } else if (e.key === key && e.newValue === null) {
            // Handle item removal in other tabs
            setStoredValue(initialValue);
        }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);


  return [storedValue, setValue];
}

export default useLocalStorage;
