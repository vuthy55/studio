
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import { languages as allLanguages, offlineAudioPackLanguages, type LanguageCode } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Download, Trash2, WifiOff, Bookmark, Unlock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getOfflineMetadata } from '@/services/offline';
import type { PackMetadata } from '@/services/offline';
import { unlockLanguagePack } from '@/actions/user';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

interface DownloadablePack {
  code: LanguageCode | 'user_saved_phrases';
  label: string;
  isDownloaded: boolean;
  size?: number;
  phraseCount?: number;
}

export default function OfflineManager() {
  const { user, userProfile, offlineAudioPacks, loadSingleOfflinePack, removeOfflinePack, savedPhrases, resyncSavedPhrasesAudio, settings, unlockLanguageInProfile } = useUserData();
  const { toast } = useToast();
  const [downloadablePacks, setDownloadablePacks] = useState<DownloadablePack[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [selectedPacks, setSelectedPacks] = useState<LanguageCode[]>([]);

  useEffect(() => {
    const buildPackList = async () => {
        const metadataArray = await getOfflineMetadata();
        const metadataMap = new Map(metadataArray.map(m => [m.id, m]));

        const languagePacks: DownloadablePack[] = offlineAudioPackLanguages.map(langCode => {
            const lang = allLanguages.find(l => l.value === langCode);
            const isDownloaded = !!offlineAudioPacks[langCode];
            const meta = metadataMap.get(langCode);
            return {
                code: langCode,
                label: lang?.label || langCode,
                isDownloaded: isDownloaded,
                size: meta?.size
            };
        });

        const savedPhrasesPack = offlineAudioPacks['user_saved_phrases'];
        const savedMeta = metadataMap.get('user_saved_phrases');
        const savedPhrasesEntry: DownloadablePack = {
            code: 'user_saved_phrases',
            label: 'My Saved Phrases',
            isDownloaded: !!savedPhrasesPack,
            size: savedMeta?.size,
            phraseCount: savedPhrases.length
        };
        
        setDownloadablePacks([savedPhrasesEntry, ...languagePacks]);
    };

    buildPackList();

  }, [offlineAudioPacks, savedPhrases.length]);

  const handleDownload = async (langCode: LanguageCode, langLabel: string) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Login Required', description: 'You must be logged in to download packs.'});
        return;
    }
    
    setIsProcessing(prev => ({...prev, [langCode]: true }));
    try {
      const isUnlocked = userProfile?.unlockedLanguages?.includes(langCode) ?? false;
      
      if (!isUnlocked) {
        // This is a purchase attempt
        const result = await unlockLanguagePack(user.uid, langCode, langLabel);
        if (result.success) {
            unlockLanguageInProfile(langCode); // Optimistic update
            toast({ title: "Language Unlocked!", description: `You can now download the ${langLabel} pack.`});
        } else {
            throw new Error(result.error || 'Failed to unlock language.');
        }
      } else {
        // This is a standard download
        await loadSingleOfflinePack(langCode);
        toast({ title: "Download Complete!", description: `${langLabel} pack is now available offline.`});
      }

    } catch (error: any) {
      console.error(`Error processing ${langCode}:`, error);
      toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    } finally {
      setIsProcessing(prev => ({...prev, [langCode]: false }));
    }
  };
  
  const handleRemove = async (langCode: LanguageCode | 'user_saved_phrases') => {
    setIsProcessing(prev => ({...prev, [langCode]: true }));
    try {
      await removeOfflinePack(langCode);
      const label = downloadablePacks.find(p => p.code === langCode)?.label || 'Pack';
      toast({ title: 'Pack Removed', description: `${label} audio has been removed.`});
    } catch (error: any) {
      console.error(`Error removing ${langCode}:`, error);
      toast({ variant: 'destructive', title: 'Removal Failed', description: error.message });
    } finally {
      setIsProcessing(prev => ({...prev, [langCode]: false }));
    }
  };
  
  const handleResync = async () => {
    setIsProcessing(prev => ({...prev, user_saved_phrases: true }));
    try {
        await resyncSavedPhrasesAudio();
        toast({ title: "Re-sync Complete", description: "Your saved phrases audio is now up-to-date for offline use."});
    } catch (error: any) {
         toast({ variant: 'destructive', title: 'Sync Failed', description: 'Could not re-sync saved phrases audio.' });
    } finally {
        setIsProcessing(prev => ({...prev, user_saved_phrases: false }));
    }
  }
  
  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return '...';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
            <Download className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Language Packs</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Language Packs</DialogTitle>
          <DialogDescription>
            To learn a new language, you must first download its language pack. Some packs are free, while others can be unlocked with tokens.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <ScrollArea className="h-72">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-4">
              {downloadablePacks.map(pack => {
                const isUnlocked = pack.code === 'user_saved_phrases' || (userProfile?.unlockedLanguages?.includes(pack.code as LanguageCode) ?? false);
                const cost = settings?.languageUnlockCost ?? 100;
                const processing = isProcessing[pack.code];
                
                return (
                    <div key={pack.code} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-md border gap-2">
                        <div className="flex items-center gap-2 flex-grow">
                            {pack.code === 'user_saved_phrases' ? (
                                <Bookmark className="h-4 w-4 mx-2 text-primary flex-shrink-0" />
                            ) : null}
                            <div className="flex flex-col">
                                <Label htmlFor={pack.code} className="font-medium">{pack.label}</Label>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {pack.phraseCount !== undefined && (
                                      <span>{pack.phraseCount} phrases</span>
                                  )}
                                  {pack.isDownloaded && pack.size !== undefined && (
                                      <>
                                        <span>&middot;</span>
                                        <span>{formatBytes(pack.size)}</span>
                                      </>
                                  )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 flex-shrink-0">
                            {pack.code === 'user_saved_phrases' ? (
                                <Button variant="outline" size="sm" onClick={handleResync} disabled={processing}>
                                    {processing ? <LoaderCircle className="animate-spin h-4 w-4" /> : 'Re-sync'}
                                </Button>
                            ) : (
                                !pack.isDownloaded && !isUnlocked && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" disabled={processing}>
                                                <Unlock className="mr-2 h-4 w-4"/> {cost} Tokens
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Unlock {pack.label}?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will spend {cost} tokens to permanently unlock this language pack for your account.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDownload(pack.code as LanguageCode, pack.label)}>
                                                    Confirm & Unlock
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )
                            )}
                        
                            {pack.isDownloaded ? (
                                <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemove(pack.code)}
                                disabled={processing}
                                >
                                {processing ? <LoaderCircle className="animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                                </Button>
                            ) : (
                                pack.code !== 'user_saved_phrases' && isUnlocked && (
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleDownload(pack.code as LanguageCode, pack.label)}
                                    disabled={processing}
                                >
                                    {processing ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                                </Button>
                                )
                            )}
                        </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
