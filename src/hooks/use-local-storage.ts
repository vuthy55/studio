
"use client";

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

// A robust custom hook to manage state in localStorage.
// This hook correctly handles server-side rendering (SSR) by delaying
// the localStorage read until the component has mounted on the client.
function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {

  // The 'get' function safely reads from localStorage on the client side.
  const get = useCallback((): T => {
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
  }, [initialValue, key]);

  // Use useState with the 'get' function to initialize state on the client.
  const [storedValue, setStoredValue] = useState<T>(get);

  // The 'set' function updates both the React state and localStorage.
  const set: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      if (typeof window === 'undefined') {
        console.warn(`Tried to set localStorage key “${key}” even though window is not defined.`);
        return;
      }
      try {
        // Allow value to be a function so we have the same API as useState
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        // Save state
        setStoredValue(valueToStore);
        // Save to local storage
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error setting localStorage key “${key}”:`, error);
      }
    },
    [key, storedValue]
  );
  
  useEffect(() => {
    // This effect ensures that if the localStorage value changes in another tab,
    // this hook will reflect that change.
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key === key) {
            setStoredValue(get());
        }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, get]);


  return [storedValue, set];
}

export default useLocalStorage;
