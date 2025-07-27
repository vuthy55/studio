
"use client";

import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getLanguageAudioPack, type AudioPack } from '@/actions/audio';
import { languages, type LanguageCode } from '@/lib/data';
import { Download, Trash2, LoaderCircle, CheckCircle2, Bookmark, RefreshCw, Coins } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { SavedPhrase } from '@/lib/types';
import { languageToLocaleMap } from '@/lib/utils';
import { generateSpeech } from '@/services/tts';
import { useUserData } from '@/context/UserDataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getGenerationMetadata, LanguagePackGenerationMetadata, getFreeLanguagePacks } from '@/actions/audiopack-admin';
import { Badge } from '../ui/badge';
import BuyTokens from '../BuyTokens';
import { Dialog, DialogContent } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const METADATA_STORE_NAME = 'AudioPackMetadata';
const DB_VERSION = 2; // Incremented version for new object store
const SAVED_PHRASES_KEY = 'user_saved_phrases';

interface PackMetadata {
  id: string; // e.g., 'khmer' or 'user_saved_phrases'
  phraseCount?: number;
  size: number;
}

interface AvailablePack extends LanguagePackGenerationMetadata {
    cost: number | 'Free';
}


// --- Database Helper Functions ---
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

// --- Component ---

export default function OfflineManager() {
  const { toast } = useToast();
  const { user, userProfile, spendTokensForTranslation, loadSingleOfflinePack, removeOfflinePack, settings } = useUserData();
  const [downloading, setDownloading] = useState<LanguageCode | 'user_saved_phrases' | null>(null);
  const [deleting, setDeleting] = useState<LanguageCode | 'user_saved_phrases' | null>(null);
  const [downloadedPacks, setDownloadedPacks] = useState<Record<string, PackMetadata>>({});
  const [isChecking, setIsChecking] = useState(true);
  
  const [availableForDownload, setAvailableForDownload] = useState<AvailablePack[]>([]);
  const [isFetchingAvailable, setIsFetchingAvailable] = useState(false);
  const [isBuyTokensOpen, setIsBuyTokensOpen] = useState(false);

  const [savedPhrases] = useLocalStorage<SavedPhrase[]>('savedPhrases', []);

  // Check for existing offline data on mount
  const checkForOfflineData = useCallback(async () => {
    setIsChecking(true);
    try {
        const db = await getDb();
        const allMetadata = await db.getAll(METADATA_STORE_NAME);
        const packs: Record<string, PackMetadata> = {};
        allMetadata.forEach(meta => {
            packs[meta.id] = meta;
        });
        setDownloadedPacks(packs);
    } catch (error) {
        console.error("Error checking for offline data:", error);
    } finally {
        setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkForOfflineData();
  }, [checkForOfflineData]);

  const handleDownload = async (lang: LanguageCode, cost: number | 'Free') => {
    if (!user || !settings) {
      toast({ variant: 'destructive', title: 'Please log in', description: 'You need to be logged in to download packs.' });
      return;
    }
    
    if (cost !== 'Free' && (userProfile?.tokenBalance || 0) < cost) {
      toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens to download this pack.` });
      setIsBuyTokensOpen(true);
      return;
    }

    setDownloading(lang);

    try {
      if (cost !== 'Free') {
        const spendSuccess = spendTokensForTranslation(`Downloaded language pack: ${lang}`, cost);
        if (!spendSuccess) {
          toast({ variant: 'destructive', title: 'Transaction Failed', description: 'Could not deduct tokens.' });
          setDownloading(null);
          return;
        }
      }

      const { audioPack, size } = await getLanguageAudioPack(lang);
      const db = await getDb();
      await db.put(STORE_NAME, audioPack, lang);

      const metadata: PackMetadata = { id: lang, size };
      await db.put(METADATA_STORE_NAME, metadata);
      
      await loadSingleOfflinePack(lang);
      
      if (cost === 'Free') {
        toast({
            title: 'Download Complete!',
            description: `Offline audio for ${languages.find(l => l.value === lang)?.label} is now available. To support our work, consider donating or referring a friend!`,
        });
      } else {
         toast({
            title: 'Download Complete!',
            description: `${cost} tokens have been deducted from your account.`,
        });
      }

      setDownloadedPacks(prev => ({...prev, [lang]: metadata}));
      // Refetch available packs to remove the one just downloaded
      handleTabChange('available');

    } catch (error) {
      console.error('Failed to download audio pack:', error);
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: 'Could not download the offline audio pack. Please try again later.',
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (lang: LanguageCode | 'user_saved_phrases') => {
    setDeleting(lang);
    try {
        const db = await getDb();
        await db.delete(STORE_NAME, lang);
        await db.delete(METADATA_STORE_NAME, lang);

        removeOfflinePack(lang);
        
        const langLabel = lang === SAVED_PHRASES_KEY
            ? 'Your Saved Phrases'
            : languages.find(l => l.value === lang)?.label;

        toast({
            title: 'Offline Data Removed',
            description: `Removed offline audio for ${langLabel}.`
        });
        setDownloadedPacks(prev => {
            const newPacks = { ...prev };
            delete newPacks[lang];
            return newPacks;
        });
    } catch (error) {
         console.error('Failed to delete audio pack:', error);
         toast({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: 'Could not remove the offline audio pack.',
      });
    } finally {
        setDeleting(null);
    }
  };

  const handleDownloadSavedPhrases = async () => {
    if (savedPhrases.length === 0 || !user) return;
    
    const cost = Math.ceil(savedPhrases.length / 5);

     if ((userProfile?.tokenBalance || 0) < cost) {
        toast({
            variant: 'destructive',
            title: 'Insufficient Tokens',
            description: `You need ${cost} tokens to download this pack.`,
        });
        setIsBuyTokensOpen(true);
        return;
    }
    
    setDownloading(SAVED_PHRASES_KEY);

    try {
        const spendSuccess = spendTokensForTranslation(`Downloaded ${savedPhrases.length} saved phrases for offline use.`, cost);
        if (!spendSuccess) {
            toast({
                variant: 'destructive',
                title: 'Transaction Failed',
                description: 'Could not deduct tokens.',
            });
            setDownloading(null);
            return;
        }


        const audioPack: AudioPack = {};
        const generationPromises = savedPhrases.map(async (phrase) => {
            const toLocale = languageToLocaleMap[phrase.toLang];
            if (toLocale) {
                try {
                    const { audioDataUri } = await generateSpeech({ text: phrase.toText, lang: toLocale, voice: 'default' });
                    audioPack[phrase.id] = audioDataUri;
                } catch (error) {
                    console.error(`Failed to generate audio for saved phrase "${phrase.id}":`, error);
                }
            }
        });

        await Promise.all(generationPromises);

        const db = await getDb();
        await db.put(STORE_NAME, audioPack, SAVED_PHRASES_KEY);
        
        const size = Buffer.from(JSON.stringify(audioPack)).length;
        const metadata: PackMetadata = { id: SAVED_PHRASES_KEY, phraseCount: savedPhrases.length, size };
        await db.put(METADATA_STORE_NAME, metadata);
        
        await loadSingleOfflinePack(SAVED_PHRASES_KEY);

        toast({
            title: 'Download Complete!',
            description: `${cost} tokens have been deducted. Your saved phrases are now available for offline practice.`,
        });
        setDownloadedPacks(prev => ({ ...prev, [SAVED_PHRASES_KEY]: metadata }));

    } catch (error) {
        console.error('Failed to download saved phrases pack:', error);
        toast({
            variant: 'destructive',
            title: 'Download Failed',
            description: 'Could not download your saved phrases. Please try again later.',
        });
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

  const handleTabChange = useCallback(async (value: string) => {
    if (value === 'available') {
        setIsFetchingAvailable(true);
        try {
             const [metadata, freePacks] = await Promise.all([
                getGenerationMetadata(),
                getFreeLanguagePacks()
            ]);
            
            const packCost = settings?.languagePackCost ?? 10;
            const completePacks = metadata
                .filter(meta => meta.generatedCount === meta.totalCount && meta.totalCount > 0 && !downloadedPacks[meta.id])
                .map(meta => ({
                    ...meta,
                    cost: freePacks.includes(meta.id as LanguageCode) ? 'Free' : packCost
                }));
            
            setAvailableForDownload(completePacks);
        } catch(e) {
            toast({variant: 'destructive', title: 'Error', description: 'Could not fetch available packs.'});
        } finally {
             setIsFetchingAvailable(false);
        }
    }
  }, [settings?.languagePackCost, downloadedPacks, toast]);

  if (isChecking) {
    return <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="animate-spin h-4 w-4" /><span>Checking for offline data...</span></div>
  }
  
  const currentlyDownloaded = Object.keys(downloadedPacks).filter(p => p !== SAVED_PHRASES_KEY);

  const savedPhrasesPackInfo = downloadedPacks[SAVED_PHRASES_KEY];
  const isSavedPhrasesDownloaded = !!savedPhrasesPackInfo;
  const isUpdateAvailable = isSavedPhrasesDownloaded && savedPhrasesPackInfo.phraseCount !== savedPhrases.length;
  const isDownloadingSaved = downloading === SAVED_PHRASES_KEY;
  const isDeletingSaved = deleting === SAVED_PHRASES_KEY;
  const savedPhrasesCost = Math.ceil(savedPhrases.length / 5);


  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-semibold">Offline Language Packs</h4>
      <Tabs defaultValue="downloaded" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="downloaded">Downloaded</TabsTrigger>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="saved">Saved Phrases</TabsTrigger>
        </TabsList>
        <TabsContent value="downloaded" className="mt-4">
            <div className="space-y-2">
                {currentlyDownloaded.length > 0 ? currentlyDownloaded.map(langCode => {
                    const lang = languages.find(l => l.value === langCode)!;
                    const downloadInfo = downloadedPacks[langCode];
                    const isDeletingThis = deleting === langCode;

                    return (
                         <div key={lang.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                            <div className="flex flex-col">
                                <span>{lang.label}</span>
                                {downloadInfo && <span className="text-xs text-muted-foreground">{formatBytes(downloadInfo.size)}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center text-sm text-green-600 font-medium"><CheckCircle2 className="h-4 w-4 mr-1.5"/> Ready</span>
                                <Button size="icon" variant="ghost" onClick={() => handleDelete(lang.value as LanguageCode)} disabled={isDeletingThis} aria-label={`Delete offline audio for ${lang.label}`}>
                                    {isDeletingThis ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                                </Button>
                            </div>
                        </div>
                    );
                }) : <p className="text-center text-sm text-muted-foreground py-4">No language packs downloaded yet.</p>}
            </div>
        </TabsContent>
        <TabsContent value="available" className="mt-4">
             {isFetchingAvailable ? (
                <div className="flex items-center justify-center py-8">
                    <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-2">
                {availableForDownload.length > 0 ? availableForDownload.map(pack => {
                    const lang = languages.find(l => l.value === pack.id)!;
                    const isDownloadingThis = downloading === pack.id;

                    return (
                        <div key={lang.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                            <div className="flex flex-col">
                                <span>{lang.label}</span>
                                <span className="text-xs text-muted-foreground">{formatBytes(pack.totalCount * 12000)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={pack.cost === 'Free' ? 'default' : 'secondary'} className="font-bold">
                                    {pack.cost === 'Free' ? 'Free' : <span className="flex items-center gap-1"><Coins className="h-3 w-3"/>{pack.cost}</span>}
                                </Badge>
                                 <Button variant="default" size="sm" onClick={() => handleDownload(lang.value as LanguageCode, pack.cost)} disabled={isDownloadingThis}>
                                    {isDownloadingThis ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /></> : <><Download className="mr-2 h-4 w-4" /></>}
                                    Download
                                </Button>
                            </div>
                        </div>
                    );
                }) : <p className="text-center text-sm text-muted-foreground py-4">All available packs are downloaded.</p>}
                </div>
            )}
        </TabsContent>
        <TabsContent value="saved" className="mt-4">
             <div className="space-y-2">
                {savedPhrases.length > 0 && user ? (
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 font-medium"><Bookmark className="h-4 w-4 text-primary"/> Your Saved Phrases ({savedPhrases.length})</span>
                            {isSavedPhrasesDownloaded && <span className="text-xs text-muted-foreground">{formatBytes(savedPhrasesPackInfo.size)}</span>}
                        </div>
                        
                        {isSavedPhrasesDownloaded && !isUpdateAvailable && (
                            <div className="flex items-center gap-2">
                                <span className="flex items-center text-sm text-green-600 font-medium"><CheckCircle2 className="h-4 w-4 mr-1.5"/> Ready</span>
                                <Button size="icon" variant="ghost" onClick={() => handleDelete(SAVED_PHRASES_KEY)} disabled={isDeletingSaved} aria-label="Delete offline saved phrases">
                                    {isDeletingSaved ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                                </Button>
                            </div>
                        )}
                        
                        {isUpdateAvailable && (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="secondary" size="sm" disabled={isDownloadingSaved}>
                                        {isDownloadingSaved ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Updating...</> : <><RefreshCw className="mr-2 h-4 w-4" />Update</>}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Update Saved Phrases?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will re-download the audio for all your saved phrases. This action will cost {savedPhrasesCost} tokens.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDownloadSavedPhrases}>Confirm</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        
                        {!isSavedPhrasesDownloaded && (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="default" size="sm" disabled={isDownloadingSaved}>
                                        {isDownloadingSaved ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Downloading...</> : <><Download className="mr-2 h-4 w-4" />Download</>}
                                    </Button>
                                </AlertDialogTrigger>
                                 <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Download Saved Phrases?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will download the audio for all {savedPhrases.length} of your saved phrases for offline use. This action will cost {savedPhrasesCost} tokens.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDownloadSavedPhrases}>Confirm & Download</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                ) : (
                    <p className="text-center text-sm text-muted-foreground py-4">You have no saved phrases to download.</p>
                )}
            </div>
        </TabsContent>
      </Tabs>
      <Dialog open={isBuyTokensOpen} onOpenChange={setIsBuyTokensOpen}>
        <DialogContent>
            <BuyTokens />
        </DialogContent>
      </Dialog>
    </div>
  );
}

