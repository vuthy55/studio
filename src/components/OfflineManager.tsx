
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import { languages as allLanguages, offlineAudioPackLanguages, type LanguageCode } from '@/lib/data';
import { getLanguageAudioPack } from '@/actions/audio';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Download, Trash2, WifiOff } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DownloadablePack {
  code: LanguageCode;
  label: string;
  isDownloaded: boolean;
  size?: number;
}

export default function OfflineManager() {
  const { userProfile, offlineAudioPacks, loadSingleOfflinePack, removeOfflinePack } = useUserData();
  const { toast } = useToast();
  const [downloadablePacks, setDownloadablePacks] = useState<DownloadablePack[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [selectedPacks, setSelectedPacks] = useState<LanguageCode[]>([]);
  const [totalSize, setTotalSize] = useState(0);

  useEffect(() => {
    const packs: DownloadablePack[] = offlineAudioPackLanguages.map(langCode => {
      const lang = allLanguages.find(l => l.value === langCode);
      const isDownloaded = !!offlineAudioPacks[langCode];
      return {
        code: langCode,
        label: lang?.label || langCode,
        isDownloaded,
      };
    });
    setDownloadablePacks(packs);

    const size = Object.values(offlineAudioPacks).reduce((acc, pack) => acc + (pack.size || 0), 0);
    setTotalSize(size);
  }, [offlineAudioPacks]);

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

  const handleRemove = async (langCode: LanguageCode) => {
    setIsProcessing(prev => ({...prev, [langCode]: true }));
    try {
      await removeOfflinePack(langCode);
      toast({ title: 'Pack Removed', description: `${allLanguages.find(l=>l.value === langCode)?.label} audio has been removed.`});
    } catch (error: any) {
      console.error(`Error removing ${langCode}:`, error);
      toast({ variant: 'destructive', title: 'Removal Failed', description: error.message });
    } finally {
      setIsProcessing(prev => ({...prev, [langCode]: false }));
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline"><WifiOff className="mr-2 h-4 w-4" /> Offline Audio</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Offline Language Packs</DialogTitle>
          <DialogDescription>
            Download audio packs to practice pronunciation without an internet connection. Unlocked languages are free to download.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
                id="select-all-packs"
                onCheckedChange={(checked) => {
                    if (checked) {
                        setSelectedPacks(downloadablePacks.filter(p => !p.isDownloaded).map(p => p.code));
                    } else {
                        setSelectedPacks([]);
                    }
                }}
            />
            <Label htmlFor="select-all-packs">Select all available for download</Label>
          </div>
          <ScrollArea className="h-72">
            <div className="space-y-2 pr-4">
              {downloadablePacks.map(pack => {
                const isUnlocked = userProfile?.unlockedLanguages?.includes(pack.code) ?? false;
                const cost = isUnlocked ? 0 : 100; // Example cost
                
                return (
                  <div key={pack.code} className="flex items-center justify-between p-2 rounded-md border">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id={pack.code}
                        checked={selectedPacks.includes(pack.code)}
                        onCheckedChange={(checked) => {
                            setSelectedPacks(prev => checked ? [...prev, pack.code] : prev.filter(c => c !== pack.code));
                        }}
                        disabled={pack.isDownloaded}
                      />
                      <Label htmlFor={pack.code} className="font-medium">{pack.label}</Label>
                      {pack.isDownloaded && <Badge variant="secondary">Downloaded</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">{cost === 0 ? 'Free' : `${cost} tokens`}</p>
                      {pack.isDownloaded ? (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleRemove(pack.code)}
                          disabled={isProcessing[pack.code]}
                        >
                          {isProcessing[pack.code] ? <LoaderCircle className="animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      ) : (
                         <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownload(pack.code)}
                          disabled={!isUnlocked || isProcessing[pack.code]}
                        >
                          {isProcessing[pack.code] ? <LoaderCircle className="animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
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
