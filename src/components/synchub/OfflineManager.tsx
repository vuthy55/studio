
"use client";

import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getLanguageAudioPack, type AudioPack } from '@/actions/audio';
import { languages, type LanguageCode } from '@/lib/data';
import { Download, Trash2, LoaderCircle, CheckCircle2, Bookmark, RefreshCw, Coins, Library, Package, ArrowDownToLine } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { SavedPhrase } from '@/lib/types';
import { languageToLocaleMap } from '@/lib/utils';
import { generateSpeech } from '@/services/tts';
import { useUserData } from '@/context/UserDataContext';
import { getGenerationMetadata, LanguagePackGenerationMetadata, getFreeLanguagePacks } from '@/actions/audiopack-admin';
import { Badge } from '../ui/badge';
import BuyTokens from '../BuyTokens';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { doc, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { db as firestoreDb } from '@/lib/firebase';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';


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
  const [downloading, setDownloading] = useState<LanguageCode | null>(null);
  const [deleting, setDeleting] = useState<LanguageCode | 'user_saved_phrases' | null>(null);
  const [downloadedPacks, setDownloadedPacks] = useState<Record<string, PackMetadata>>({});
  const [isChecking, setIsChecking] = useState(true);
  
  const [availableForDownload, setAvailableForDownload] = useState<AvailablePack[]>([]);
  const [isFetchingAvailable, setIsFetchingAvailable] = useState(true);
  
  const [isDownloadedOpen, setIsDownloadedOpen] = useState(false);
  const [isAvailableOpen, setIsAvailableOpen] = useState(false);
  const [isBuyTokensOpen, setIsBuyTokensOpen] = useState(false);

  const fetchAvailablePacks = useCallback(async () => {
    if (!user || !settings) {
        setIsFetchingAvailable(false);
        return;
    };
    setIsFetchingAvailable(true);
    try {
        const [metadata, freePacks] = await Promise.all([
            getGenerationMetadata(),
            getFreeLanguagePacks()
        ]);
        
        const packCost = settings?.languageUnlockCost ?? 100;
        const unlockedLangsSet = new Set(userProfile?.unlockedLanguages || []);

        const completePacks: AvailablePack[] = metadata
            .filter(meta => meta.generatedCount === meta.totalCount && meta.totalCount > 0 && !downloadedPacks[meta.id])
            .map(meta => {
                const langCode = meta.id as LanguageCode;
                let cost: number | 'Free' = packCost;
                
                if (unlockedLangsSet.has(langCode)) {
                    cost = 'Free';
                } else if (freePacks.includes(langCode)) {
                    cost = 'Free';
                }

                return { ...meta, cost };
            });
        
        setAvailableForDownload(completePacks);
    } catch(e) {
        toast({variant: 'destructive', title: 'Error', description: 'Could not fetch available packs.'});
    } finally {
        setIsFetchingAvailable(false);
    }
  }, [settings, downloadedPacks, toast, user, userProfile?.unlockedLanguages]);

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

   // Fetch available packs on mount and when downloaded packs change
  useEffect(() => {
    if (!isChecking) {
        fetchAvailablePacks();
    }
  }, [isChecking, fetchAvailablePacks]);


  const handleDownload = async (lang: LanguageCode, cost: number | 'Free') => {
    if (!user || !settings) {
      toast({ variant: 'destructive', title: 'Please log in', description: 'You need to be logged in to download packs.' });
      return;
    }
    
    if (cost !== 'Free' && (userProfile?.tokenBalance || 0) < cost) {
      toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${cost} tokens to download this pack.` });
      setIsAvailableOpen(false); // Close current dialog
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
      
       // Manually add the new language to the user profile's unlocked list
       if(user) {
            const userDocRef = doc(firestoreDb, 'users', user.uid);
            await updateDoc(userDocRef, {
                unlockedLanguages: arrayUnion(lang)
            });
        }
      
      if (cost === 'Free') {
        toast({
            title: 'Download Complete!',
            description: `Offline audio for ${languages.find(l => l.value === lang)?.label} is now available.`,
        });
      } else {
         toast({
            title: 'Download Complete!',
            description: `${cost} tokens have been deducted from your account.`,
        });
      }

      setDownloadedPacks(prev => ({...prev, [lang]: metadata}));
      // Refetch available packs to remove the one just downloaded
      fetchAvailablePacks();

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
        await removeOfflinePack(lang);
        
        // When deleting, we only remove the local copy. We DO NOT remove it from `unlockedLanguages`.
        // This ensures they can re-download it for free later.
        
        const langLabel = lang === SAVED_PHRASES_KEY
            ? 'Your Saved Phrases'
            : languages.find(l => l.value === lang)?.label;

        toast({
            title: 'Offline Data Removed',
            description: `Removed offline audio for ${langLabel}. It can be re-downloaded from the 'Available' list.`
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

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  const currentlyDownloaded = Object.keys(downloadedPacks).filter(p => p !== SAVED_PHRASES_KEY);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-semibold">Offline Language Packs</h4>
      
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {/* Downloaded Packs Button & Dialog */}
        <Dialog open={isDownloadedOpen} onOpenChange={setIsDownloadedOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <DialogTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <Package className="h-5 w-5 md:mr-2" />
                                <span className="hidden md:inline">Downloaded</span>
                                <Badge variant="secondary" className="ml-2">{currentlyDownloaded.length}</Badge>
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                     <TooltipContent className="md:hidden">
                        <p>Downloaded Packs</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Downloaded Language Packs</DialogTitle>
                    <DialogDescription>These packs are available for offline use.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                <div className="space-y-2 pr-4 py-2">
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
                    }) : <p className="text-center text-sm text-muted-foreground py-8">No language packs downloaded yet.</p>}
                </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>

        {/* Available Packs Button & Dialog */}
        <Dialog open={isAvailableOpen} onOpenChange={setIsAvailableOpen}>
             <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <DialogTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <ArrowDownToLine className="h-5 w-5 md:mr-2" />
                                <span className="hidden md:inline">Available</span>
                                {isFetchingAvailable ? <LoaderCircle className="h-4 w-4 animate-spin ml-2"/> : availableForDownload.length > 0 && <Badge variant="secondary" className="ml-2">{availableForDownload.length}</Badge>}
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                     <TooltipContent className="md:hidden">
                        <p>Available Packs</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Available Language Packs</DialogTitle>
                    <DialogDescription>Download packs for offline audio and practice.</DialogDescription>
                </DialogHeader>
                 {isFetchingAvailable ? (
                    <div className="flex items-center justify-center py-8">
                        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <ScrollArea className="max-h-[60vh]">
                    <div className="space-y-2 pr-4 py-2">
                    {availableForDownload.length > 0 ? availableForDownload.map(pack => {
                        const lang = languages.find(l => l.value === pack.id)!;
                        const isDownloadingThis = downloading === pack.id;

                        return (
                            <div key={lang.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                <div className="flex flex-col">
                                    <span>{lang.label}</span>
                                    <span className="text-xs text-muted-foreground">{formatBytes(pack.totalCount * 12000)} (est)</span>
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
                    }) : <p className="text-center text-sm text-muted-foreground py-8">All available packs are downloaded.</p>}
                    </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
      </div>
      
      <Dialog open={isBuyTokensOpen} onOpenChange={setIsBuyTokensOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Insufficient Tokens</DialogTitle>
                <DialogDescription>
                    You need more tokens to perform this action. Please purchase a token package below.
                </DialogDescription>
            </DialogHeader>
            <BuyTokens />
        </DialogContent>
      </Dialog>
    </div>
  );
}
