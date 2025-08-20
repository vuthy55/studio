
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import { languages as allLanguages, offlineAudioPackLanguages, type LanguageCode } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Download, Trash2, Bookmark, Unlock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { getOfflineMetadata } from '@/services/offline';
import type { PackMetadata } from '@/services/offline';

interface DownloadablePack {
  code: LanguageCode | 'user_saved_phrases';
  label: string;
  isDownloaded: boolean;
  size?: number;
  phraseCount?: number;
}

export default function OfflineManager() {
  const { userProfile, settings, offlineAudioPacks, loadSingleOfflinePack, removeOfflinePack, savedPhrases, resyncSavedPhrasesAudio, unlockLanguagePack } = useUserData();
  const { toast } = useToast();
  const [downloadablePacks, setDownloadablePacks] = useState<DownloadablePack[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [selectedPacks, setSelectedPacks] = useState<LanguageCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const buildPackList = async () => {
        setIsLoading(true);
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
        setIsLoading(false);
    };

    buildPackList();

  }, [offlineAudioPacks, savedPhrases.length]);

  const handleDownload = async (langCode: LanguageCode) => {
    setIsProcessing(prev => ({...prev, [langCode]: true }));
    try {
      await loadSingleOfflinePack(langCode);
      toast({ title: "Download Complete!", description: `${allLanguages.find(l=>l.value === langCode)?.label} pack is now available offline.`});
    } catch (error: any) {
      console.error(`Error downloading ${langCode}:`, error);
      toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
    } finally {
      setIsProcessing(prev => ({...prev, [langCode]: false }));
    }
  };
  
  const handleBatchDownload = async () => {
    if (selectedPacks.length === 0) return;
    const packsToDownload = selectedPacks.filter(code => !downloadablePacks.find(p => p.code === code)?.isDownloaded);

    for (const langCode of packsToDownload) {
      await handleDownload(langCode);
    }
    setSelectedPacks([]);
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

  const handleUnlock = async (langCode: LanguageCode) => {
    setIsProcessing(prev => ({...prev, [langCode]: true }));
    try {
        await unlockLanguagePack(langCode);
        toast({ title: "Language Unlocked!", description: `You can now download the ${allLanguages.find(l=>l.value === langCode)?.label} pack.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Unlock Failed', description: error.message });
    } finally {
        setIsProcessing(prev => ({...prev, [langCode]: false }));
    }
  };
  
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Language Packs</DialogTitle>
          <DialogDescription>
            To learn a new language, you must first download its language pack. Some packs are free, while others can be unlocked with tokens.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-auto min-h-0 py-4">
            {isLoading ? (
                 <div className="flex justify-center items-center h-full">
                    <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                 </div>
            ) : (
                <>
                    <div className="flex items-center space-x-2 px-1 mb-4">
                        <Checkbox 
                            id="select-all-packs"
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    const allDownloadable = downloadablePacks.filter(p => !p.isDownloaded && p.code !== 'user_saved_phrases' && userProfile?.unlockedLanguages?.includes(p.code as LanguageCode)).map(p => p.code as LanguageCode);
                                    setSelectedPacks(allDownloadable);
                                } else {
                                    setSelectedPacks([]);
                                }
                            }}
                        />
                        <Label htmlFor="select-all-packs">Select all available for download</Label>
                    </div>
                    <ScrollArea className="h-full pr-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {downloadablePacks.map(pack => {
                            const isUnlocked = pack.code === 'user_saved_phrases' || (userProfile?.unlockedLanguages?.includes(pack.code as LanguageCode) ?? false);
                            const cost = settings?.languageUnlockCost ?? 100;
                            
                            return (
                                <div key={pack.code} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-md border gap-2">
                                    <div className="flex items-center gap-2 flex-grow">
                                        {pack.code !== 'user_saved_phrases' ? (
                                            <Checkbox 
                                            id={pack.code}
                                            checked={selectedPacks.includes(pack.code as LanguageCode)}
                                            onCheckedChange={(checked) => {
                                                setSelectedPacks(prev => checked ? [...prev, pack.code as LanguageCode] : prev.filter(c => c !== pack.code));
                                            }}
                                            disabled={pack.isDownloaded || !isUnlocked}
                                            />
                                        ) : (
                                            <Bookmark className="h-4 w-4 mx-2 text-primary flex-shrink-0" />
                                        )}
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
                                            <Button variant="outline" size="sm" onClick={handleResync} disabled={isProcessing[pack.code]}>
                                                {isProcessing[pack.code] ? <LoaderCircle className="animate-spin h-4 w-4" /> : 'Re-sync'}
                                            </Button>
                                        ) : pack.isDownloaded ? (
                                            <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => handleRemove(pack.code as LanguageCode)}
                                            disabled={isProcessing[pack.code]}
                                            >
                                            {isProcessing[pack.code] ? <LoaderCircle className="animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                                            </Button>
                                        ) : isUnlocked ? (
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => handleDownload(pack.code as LanguageCode)}
                                                disabled={isProcessing[pack.code]}
                                            >
                                                {isProcessing[pack.code] ? <LoaderCircle className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                                            </Button>
                                        ) : (
                                            <Button size="sm" onClick={() => handleUnlock(pack.code as LanguageCode)} disabled={isProcessing[pack.code]}>
                                                {isProcessing[pack.code] ? <LoaderCircle className="animate-spin mr-2 h-4 w-4" /> : <Unlock className="mr-2 h-4 w-4" />}
                                                {cost}
                                            </Button>
                                        )}
                                    </div>
                            </div>
                            )
                        })}
                        </div>
                    </ScrollArea>
                </>
            )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose>
          <Button 
            type="button" 
            onClick={handleBatchDownload} 
            disabled={selectedPacks.length === 0 || Object.values(isProcessing).some(Boolean)}
          >
            {Object.values(isProcessing).some(Boolean) ? <LoaderCircle className="animate-spin" /> : `Download Selected (${selectedPacks.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
