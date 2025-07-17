
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

const getInitialLanguage = (key: string, fallback: LanguageCode): LanguageCode => {
    if (typeof window !== 'undefined') {
        const storedValue = localStorage.getItem(key);
        const isValid = storedValue && languages.some(l => l.value === storedValue);
        if (isValid) {
            return storedValue as LanguageCode;
        }
    }
    return fallback;
};


export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [fromLanguage, setFromLanguageState] = useState<LanguageCode>(() => getInitialLanguage('fromLanguage', 'english'));
  const [toLanguage, setToLanguageState] = useState<LanguageCode>(() => getInitialLanguage('toLanguage', 'thai'));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('fromLanguage', fromLanguage);
    }
  }, [fromLanguage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('toLanguage', toLanguage);
    }
  }, [toLanguage]);

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
