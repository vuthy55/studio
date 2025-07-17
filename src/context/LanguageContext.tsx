
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { LanguageCode } from '@/lib/data';
import { languages } from '@/lib/data';

interface LanguageContextType {
  fromLanguage: LanguageCode;
  setFromLanguage: (language: LanguageCode) => void;
  toLanguage: LanguageCode;
  setToLanguage: (language: LanguageCode) => void;
  swapLanguages: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// This function will now be used inside the effect
const getInitialLanguage = (key: string, fallback: LanguageCode): LanguageCode => {
    const storedValue = localStorage.getItem(key);
    const isValid = storedValue && languages.some(l => l.value === storedValue);
    return isValid ? storedValue as LanguageCode : fallback;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  // Initialize state with default values, which will match the server render
  const [fromLanguage, setFromLanguageState] = useState<LanguageCode>('english');
  const [toLanguage, setToLanguageState] = useState<LanguageCode>('thai');
  const [isMounted, setIsMounted] = useState(false);

  // After the component mounts on the client, load the values from localStorage
  useEffect(() => {
    setIsMounted(true);
    setFromLanguageState(getInitialLanguage('fromLanguage', 'english'));
    setToLanguageState(getInitialLanguage('toLanguage', 'thai'));
  }, []);

  useEffect(() => {
    // Only save to localStorage after the initial mount and when the value changes
    if (isMounted) {
      localStorage.setItem('fromLanguage', fromLanguage);
    }
  }, [fromLanguage, isMounted]);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('toLanguage', toLanguage);
    }
  }, [toLanguage, isMounted]);

  const setFromLanguage = (language: LanguageCode) => {
    setFromLanguageState(language);
  };

  const setToLanguage = (language: LanguageCode) => {
    setToLanguageState(language);
  };

  const swapLanguages = () => {
    const temp = fromLanguage;
    setFromLanguageState(toLanguage);
    setToLanguageState(temp);
  };

  return (
    <LanguageContext.Provider value={{ fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
