
"use client";

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { LanguageCode } from '@/lib/data';
import type { AudioPack } from '@/lib/types';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const METADATA_STORE_NAME = 'AudioPackMetadata';
const DB_VERSION = 2; // Incremented version for new object store
const SAVED_PHRASES_KEY = 'user_saved_phrases';

export interface PackMetadata {
  id: string; // e.g., 'khmer' or 'user_saved_phrases'
  phraseCount?: number;
  size: number;
}


async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(METADATA_STORE_NAME)) {
        db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export async function getOfflineAudio(lang: LanguageCode | 'user_saved_phrases'): Promise<AudioPack | undefined> {
    const db = await getDb();
    return db.get(STORE_NAME, lang);
}


export async function loadSingleOfflinePack(lang: LanguageCode | 'user_saved_phrases', audioPack: AudioPack, size: number): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, audioPack, lang);
    
    const metadata: PackMetadata = { id: lang, size };
    await db.put(METADATA_STORE_NAME, metadata);
}


export async function removeOfflinePack(lang: LanguageCode | 'user_saved_phrases'): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, lang);
    await db.delete(METADATA_STORE_NAME, lang);
}


export async function getOfflineMetadata(): Promise<PackMetadata[]> {
    const db = await getDb();
    return db.getAll(METADATA_STORE_NAME);
}

// THIS IS THE REGRESSED, INCORRECT FUNCTION. IT SHOULD NOT BE USED.
// The correct implementation is in UserDataContext, which fetches from storage.
// This is kept here to demonstrate the regression but should be considered deprecated.
export async function getLanguageAudioPack(lang: LanguageCode): Promise<AudioPack> {
  console.error("DEPRECATED: getLanguageAudioPack called. This function performs live generation and should not be used for downloading packs.");
  // This is a placeholder for the actual expensive generation logic.
  // In a real scenario, this would call the TTS service for every phrase.
  return {};
}
