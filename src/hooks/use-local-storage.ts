
"use client";

import { useState, useEffect, useCallback } from 'react';

// A custom hook to manage state in localStorage.
// This hook ensures that state is synchronized with localStorage and across components.
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // We need to use a function for the initial state to avoid hydration mismatches.
  // This function is only executed on the client-side.
  const [internalValue, setInternalValue] = useState<T>(initialValue);

  // On the client, after the initial render, we get the value from localStorage.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          setInternalValue(JSON.parse(item));
        }
      } catch (error) {
        console.error(`Error reading localStorage key “${key}”:`, error);
      }
    }
  }, [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    if (typeof window === 'undefined') {
        console.warn(`Tried to set localStorage key “${key}” even though window is not defined. This is a no-op.`);
        return;
    }

    try {
      const valueToStore = value instanceof Function ? value(internalValue) : value;
      setInternalValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, internalValue]);

  return [internalValue, setValue];
}

export default useLocalStorage;
