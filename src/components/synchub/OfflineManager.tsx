
"use client";

import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getLanguageAudioPack, type AudioPack } from '@/actions/audio';
import { languages, type LanguageCode } from '@/lib/data';
import { Download, Trash2, LoaderCircle, CheckCircle2 } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';


const DB_NAME = 'VibeSync-Offline';
const STORE_NAME = 'AudioPacks';
const DB_VERSION = 1;

// --- Database Helper Functions ---
async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function getOfflineAudio(lang: LanguageCode): Promise<AudioPack | undefined> {
    const db = await getDb();
    return db.get(STORE_NAME, lang);
}

// --- Component ---

export default function OfflineManager() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<LanguageCode | null>(null);
  const [deleting, setDeleting] = useState<LanguageCode | null>(null);
  const [downloadedLanguages, setDownloadedLanguages] = useLocalStorage<Record<string, { size: number }>>('offlineLanguagePacks', {});
  const [isChecking, setIsChecking] = useState(true);

  // Check for existing offline data on mount
  const checkForOfflineData = useCallback(async () => {
    setIsChecking(true);
    const db = await getDb();
    const keys = await db.getAllKeys(STORE_NAME);
    const offlineData: Record<string, { size: number }> = {};
    
    // Ensure that only keys that actually exist in the DB are in our state
    keys.forEach(key => {
        const langCode = key as LanguageCode;
        offlineData[langCode] = downloadedLanguages[langCode] || { size: 0 }; // Keep existing size if available
    });

    setDownloadedLanguages(offlineData);
    setIsChecking(false);
  }, [setDownloadedLanguages, downloadedLanguages]);

  useEffect(() => {
    checkForOfflineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (lang: LanguageCode) => {
    setDownloading(lang);
    try {
      const { audioPack, size } = await getLanguageAudioPack(lang);
      const db = await getDb();
      await db.put(STORE_NAME, audioPack, lang);
      toast({
        title: 'Download Complete!',
        description: `Offline audio for ${languages.find(l => l.value === lang)?.label} is now available.`,
      });
      setDownloadedLanguages(prev => ({...prev, [lang]: { size }}));
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

  const handleDelete = async (lang: LanguageCode) => {
    setDeleting(lang);
    try {
        const db = await getDb();
        await db.delete(STORE_NAME, lang);
        toast({
            title: 'Offline Data Removed',
            description: `Removed offline audio for ${languages.find(l => l.value === lang)?.label}.`
        });
        setDownloadedLanguages(prev => {
            const newDownloads = { ...prev };
            delete newDownloads[lang];
            return newDownloads;
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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  if (isChecking) {
    return <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="animate-spin h-4 w-4" /><span>Checking for offline data...</span></div>
  }

  // For this phase, we only show Khmer
  const offlineReadyLanguages = ['khmer'];

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-semibold">Offline Language Packs</h4>
      <div className="space-y-2">
        {offlineReadyLanguages.map(langCode => {
          const lang = languages.find(l => l.value === langCode)!;
          const downloadInfo = downloadedLanguages[lang.value];
          const isDownloaded = !!downloadInfo;
          const isDownloadingThis = downloading === lang.value;
          const isDeletingThis = deleting === lang.value;

          return (
            <div key={lang.value} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex flex-col">
                <span>{lang.label}</span>
                 {isDownloaded && <span className="text-xs text-muted-foreground">{formatBytes(downloadInfo.size)}</span>}
              </div>
              {isDownloaded ? (
                <div className="flex items-center gap-2">
                    <span className="flex items-center text-sm text-green-600 font-medium"><CheckCircle2 className="h-4 w-4 mr-1.5"/> Ready for Offline Use</span>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(lang.value)}
                        disabled={isDeletingThis}
                        aria-label={`Delete offline audio for ${lang.label}`}
                    >
                         {isDeletingThis ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleDownload(lang.value)}
                  disabled={isDownloadingThis}
                >
                  {isDownloadingThis ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
