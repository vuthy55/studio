"use client";

import * as React from 'react';
import type { LanguageCode } from '@/lib/data';
import useLocalStorage from '@/hooks/use-local-storage';

interface LanguageContextType {
  fromLanguage: LanguageCode;
  setFromLanguage: (language: LanguageCode) => void;
  toLanguage: LanguageCode;
  setToLanguage: (language: LanguageCode) => void;
  swapLanguages: () => void;
}

const LanguageContext = React.createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [fromLanguage, setFromLanguage] = useLocalStorage<LanguageCode>('fromLanguage', 'english');
  const [toLanguage, setToLanguage] = useLocalStorage<LanguageCode>('toLanguage', 'khmer');

  const swapLanguages = () => {
    const temp = fromLanguage;
    setFromLanguage(toLanguage);
    setToLanguage(temp);
  };

  return (
    <LanguageContext.Provider value={{ fromLanguage, setFromLanguage, toLanguage, setToLanguage, swapLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = React.useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
