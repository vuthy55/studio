
"use client";

import { useState, useEffect, useCallback } from 'react';

// A custom hook to manage state in localStorage.
// This hook ensures that state is synchronized with localStorage and across components.
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // We need to use a function for the initial state to avoid hydration mismatches.
  // This function is only executed on the client-side.
  const [internalValue, setInternalValue] = useState<T>(() => {
    // This function is only executed on the client-side for the initial state.
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        try {
          return JSON.parse(item);
        } catch (e) {
          return item as unknown as T;
        }
      }
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
    }
    return initialValue;
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    if (typeof window === 'undefined') {
        console.warn(`Tried to set localStorage key “${key}” even though window is not defined. This is a no-op.`);
        return;
    }

    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(internalValue) : value;
      // Save state
      setInternalValue(valueToStore);
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, internalValue]);

  return [internalValue, setValue];
}

export default useLocalStorage;
