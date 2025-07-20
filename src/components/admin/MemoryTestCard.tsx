
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle, Play, Vials } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '../ui/scroll-area';

// Polyfill for performance.measureUserAgentSpecificMemory() if it doesn't exist
declare global {
  interface Performance {
    measureUserAgentSpecificMemory?(): Promise<{ bytes: number, breakdown: any[] }>;
  }
}

// Simple delay utility
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function MemoryTestCard() {
  const router = useRouter();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  const handleStartTest = async () => {
    if (!('measureUserAgentSpecificMemory' in performance)) {
      toast({
        variant: 'destructive',
        title: 'API Not Available',
        description: 'The User-Agent-Specific Memory API is not available in this browser. Please use a compatible Chromium browser.',
      });
      return;
    }

    setIsRunning(true);
    setLogLines(['[INFO] Starting memory test cycle...']);

    const paths = ['/', '/test', '/admin', '/stats', '/profile'];
    const cycles = 4;
    const pauseDuration = 3000; // 3 seconds

    for (let i = 0; i < cycles; i++) {
        const cycleNum = i + 1;
        setLogLines(prev => [...prev, `\n[CYCLE ${cycleNum}/${cycles}]`]);

        for (const path of paths) {
            try {
                // Navigate
                router.push(path);
                setLogLines(prev => [...prev, `  Navigating to ${path}...`]);
                await delay(pauseDuration); // Wait for page to render and potential leaks to manifest

                // Measure memory
                const memorySample = await performance.measureUserAgentSpecificMemory!();
                const memoryMB = (memorySample.bytes / (1024 * 1024)).toFixed(2);
                setLogLines(prev => [...prev, `  [OK] Memory at ${path}: ${memoryMB} MB`]);

            } catch (error: any) {
                const errorMessage = `  [ERROR] Failed at path ${path}: ${error.message}`;
                setLogLines(prev => [...prev, errorMessage]);
                toast({ variant: 'destructive', title: 'Test Error', description: `The test failed at path ${path}. Check the console.` });
                setIsRunning(false);
                return;
            }
        }
    }

    setLogLines(prev => [...prev, '\n[INFO] Test completed.']);
    setIsRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Vials />
            Memory Diagnostics
        </CardTitle>
        <CardDescription>
          Run an automated test to cycle through pages and log memory usage. This helps identify memory leaks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleStartTest} disabled={isRunning}>
          {isRunning ? <LoaderCircle className="mr-2 animate-spin" /> : <Play className="mr-2" />}
          {isRunning ? 'Test Running...' : 'Start Memory Test'}
        </Button>
        {logLines.length > 0 && (
          <ScrollArea className="h-60 w-full rounded-md border bg-muted p-4">
            <pre className="text-xs whitespace-pre-wrap">
              {logLines.join('\n')}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
