
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { LanguageCode } from './data';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const languageToLocaleMap: Partial<Record<LanguageCode, string>> = {
    english: 'en-US', thai: 'th-TH', vietnamese: 'vi-VN', khmer: 'km-KH', filipino: 'fil-PH',
    malay: 'ms-MY', indonesian: 'id-ID', burmese: 'my-MM', laos: 'lo-LA', tamil: 'ta-IN',
    chinese: 'zh-CN', french: 'fr-FR', spanish: 'es-ES', italian: 'it-IT',
};
