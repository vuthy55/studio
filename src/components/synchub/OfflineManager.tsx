
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { languages, type LanguageCode, phrasebook, type Topic } from '@/lib/data';
import { Download, Trash2, LoaderCircle, CheckCircle2, Bookmark, RefreshCw, ChevronDown, Package, PackageCheck } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { SavedPhrase } from '@/lib/types';
import { languageToLocaleMap } from '@/lib/utils';
import { generateSpeech } from '@/services/tts';
import { useUserData } from '@/context/UserDataContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const DB_VERSION = 2;
const SAVED_PHRASES_KEY = 'user_saved_phrases';

type AudioPack = {
  [phraseId: string]: string;
};

interface AudioPackMetadata {
  id: string;
  language: string;
  downloadUrl: string;
  size: number;
  updatedAt: any;
  topicStats: Record<string, { totalPhrases: number; generatedAudio: number }>;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}


/**
 * Retrieves an audio pack from the local IndexedDB.
 * @param packId The ID of the pack to retrieve (e.g., 'khmer' or 'user_saved_phrases').
 * @returns The audio pack object or undefined if not found.
 */
export async function getOfflineAudio(packId: string): Promise<AudioPack | undefined> {
    try {
        const db = await getDb();
        return await db.get(STORE_NAME, packId);
    } catch (error) {
        console.error(`Error fetching offline pack "${packId}":`, error);
        return undefined;
    }
}


export default function OfflineManager() {
  const { toast } = useToast();
  const { user, spendTokensForTranslation } = useUserData();

  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  
  const [availablePacks, setAvailablePacks] = useState<AudioPackMetadata[]>([]);
  const [downloadedPacks, setDownloadedPacks] = useState<string[]>([]);

  const [isDownloadListOpen, setIsDownloadListOpen] = useState(false);
  const [isAvailableListOpen, setIsAvailableListOpen] = useState(false);
  
  const [savedPhrases] = useLocalStorage<SavedPhrase[]>('savedPhrases', []);

  const checkForDownloadedPacks = useCallback(async () => {
    setIsChecking(true);
    try {
      const db = await getDb();
      const keys = await db.getAllKeys(STORE_NAME);
      setDownloadedPacks(keys as string[]);
    } catch (error) {
      console.error("Error checking for offline data:", error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkForDownloadedPacks();

    const packsRef = collection(db, 'audioPacks');
    const unsubscribe = onSnapshot(packsRef, (snapshot) => {
        const packs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AudioPackMetadata));
        setAvailablePacks(packs);
    });

    return () => unsubscribe();
  }, [checkForDownloadedPacks]);


  const handleDelete = async (packId: string) => {
    setDeleting(packId);
    try {
        const db = await getDb();
        await db.delete(STORE_NAME, packId);
        toast({
            title: 'Offline Data Removed',
            description: `Removed offline audio for ${packId}.`
        });
        await checkForDownloadedPacks();
    } catch (error) {
         console.error('Failed to delete audio pack:', error);
         toast({ variant: 'destructive', title: 'Deletion Failed' });
    } finally {
        setDeleting(null);
    }
  };

  const handleDownloadPack = async (pack: AudioPackMetadata) => {
    setDownloading(pack.id);
    try {
        const response = await fetch(pack.downloadUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const audioPack = await response.json();
        const db = await getDb();
        await db.put(STORE_NAME, audioPack, pack.id);
        toast({ title: 'Download Complete!', description: `Offline audio for ${pack.language} is now available.` });
        await checkForDownloadedPacks();
    } catch (error) {
        console.error(`Failed to download audio pack for ${pack.language}:`, error);
        toast({ variant: 'destructive', title: 'Download Failed' });
    } finally {
        setDownloading(null);
    }
  };

  const handleDownloadSavedPhrases = async () => {
    if (savedPhrases.length === 0 || !user) return;
    
    const cost = Math.ceil(savedPhrases.length / 5);
    const hasSufficientTokens = spendTokensForTranslation(`Downloaded ${savedPhrases.length} saved phrases for offline use.`, cost);

    if (!hasSufficientTokens) {
        toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens.` });
        return;
    }
    
    setDownloading(SAVED_PHRASES_KEY);

    try {
        const audioPack: AudioPack = {};
        const generationPromises = savedPhrases.map(async (phrase) => {
            const toLocale = languageToLocaleMap[phrase.toLang];
            if (toLocale) {
                try {
                    const { audioDataUri } = await generateSpeech({ text: phrase.toText, lang: toLocale, voice: 'default' });
                    audioPack[phrase.id] = audioDataUri;
                } catch (error) { console.error(`Failed to gen audio for saved phrase "${phrase.id}":`, error); }
            }
        });

        await Promise.all(generationPromises);

        const db = await getDb();
        await db.put(STORE_NAME, audioPack, SAVED_PHRASES_KEY);

        toast({ title: 'Download Complete!', description: 'Your saved phrases are now available for offline practice.'});
        await checkForDownloadedPacks();

    } catch (error) {
        console.error('Failed to download saved phrases pack:', error);
        toast({ variant: 'destructive', title: 'Download Failed' });
    } finally {
        setDownloading(null);
    }
  }


  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  const packsToDownload = availablePacks.filter(p => !downloadedPacks.includes(p.id));
  const savedPhrasesCost = Math.ceil(savedPhrases.length / 5);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-semibold">Offline Content Management</h4>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => setIsDownloadListOpen(prev => !prev)} className="justify-between">
                Download Packages ({packsToDownload.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${isDownloadListOpen ? 'rotate-180' : ''}`} />
            </Button>
            <Button variant="outline" onClick={() => setIsAvailableListOpen(prev => !prev)} className="justify-between">
                Available Offline ({downloadedPacks.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${isAvailableListOpen ? 'rotate-180' : ''}`} />
            </Button>
            <Button 
              variant="outline" 
              onClick={handleDownloadSavedPhrases}
              disabled={downloading === SAVED_PHRASES_KEY || savedPhrases.length === 0}
            >
                {downloading === SAVED_PHRASES_KEY ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>
                ) : (
                    <Bookmark className="mr-2 h-4 w-4"/>
                )}
                Saved Phrases ({savedPhrasesCost} Tokens)
            </Button>
       </div>

        {isDownloadListOpen && (
            <div className="space-y-2 pt-2 border-t">
                {packsToDownload.length > 0 ? packsToDownload.map(pack => (
                    <div key={pack.id} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                        <span>{pack.language} ({formatBytes(pack.size)})</span>
                        <Button size="sm" onClick={() => handleDownloadPack(pack)} disabled={!!downloading}>
                            {downloading === pack.id ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                        </Button>
                    </div>
                )) : <p className="text-sm text-center text-muted-foreground py-2">All language packs are downloaded.</p>}
            </div>
        )}

        {isAvailableListOpen && (
             <div className="space-y-2 pt-2 border-t">
                {downloadedPacks.length > 0 ? downloadedPacks.map(packId => {
                    const lang = languages.find(l => l.value === packId);
                    const name = packId === SAVED_PHRASES_KEY ? 'Your Saved Phrases' : lang?.label;
                    return (
                        <div key={packId} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                            <span className="flex items-center gap-2 text-green-600 font-medium">
                                <PackageCheck className="h-4 w-4"/>
                                {name}
                            </span>
                             <Button size="icon" variant="ghost" onClick={() => handleDelete(packId)} disabled={!!deleting}>
                                {deleting === packId ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                            </Button>
                        </div>
                    )
                }) : <p className="text-sm text-center text-muted-foreground py-2">No packages downloaded yet.</p>}
            </div>
        )}

    </div>
  );
}
