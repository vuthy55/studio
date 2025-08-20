
"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Heart, LoaderCircle } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import type { OnApproveData } from "@paypal/paypal-js";
import { createPayPalOrder, capturePayPalDonation } from '@/actions/paypal';
import { ScrollArea } from './ui/scroll-area';


interface DonateButtonProps {
    variant?: 'button' | 'icon';
}

export default function DonateButton({ variant = 'button' }: DonateButtonProps) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [amount, setAmount] = useState(5.00);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const presetAmounts = [5, 10, 25];

  const isProduction = process.env.NODE_ENV === 'production';
  const PAYPAL_CLIENT_ID = isProduction 
    ? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE 
    : process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX;

  const handleCreateOrder = async (): Promise<string> => {
     if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to donate.' });
        throw new Error('User not logged in');
    }
    
    const { orderID, error, debugLog: log } = await createPayPalOrder({
        userId: user.uid,
        orderType: 'donation',
        value: amount,
    });
    
    setDebugLog(log || []);

    if (error || !orderID) {
        const description = (
          <div>
            <p className="font-semibold">{error}</p>
            {log && log.length > 0 && (
              <ScrollArea className="mt-2 h-32 w-full rounded-md border bg-muted p-2">
                <pre className="text-xs whitespace-pre-wrap">{log.join('\n')}</pre>
              </ScrollArea>
            )}
          </div>
        );
        toast({ variant: 'destructive', title: 'Order Creation Failed', description, duration: 20000 });
        throw new Error(error || 'Could not create PayPal order.');
    }
    return orderID;
  };

  const handleOnApprove = async (data: OnApproveData) => {
      setIsProcessing(true);
      if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In' });
        setIsProcessing(false);
        return;
      }
      try {
          const result = await capturePayPalDonation(data.orderID, user.uid, amount);
          if (result.success) {
            toast({ title: 'Thank You!', description: result.message });
          } else {
            throw new Error(result.message);
          }
      } catch (error: any) {
          toast({ variant: 'destructive', title: 'Error', description: 'There was an issue logging your donation.' });
      } finally {
          setIsProcessing(false);
          setDialogOpen(false);
      }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {variant === 'icon' ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Heart className="h-5 w-5" />
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Donate</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
            <DialogTrigger asChild>
                <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <Heart className="mr-2 h-4 w-4" /> Donate
                </Button>
            </DialogTrigger>
        )}
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Make a Donation</DialogTitle>
                <DialogDescription>
                   Your support helps us keep the servers running and continue development. Thank you!
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                 <div className="grid grid-cols-3 gap-2">
                    {presetAmounts.map(preset => (
                        <Button 
                            key={preset}
                            variant="outline"
                            className={cn(amount === preset && 'border-primary ring-2 ring-primary')}
                            onClick={() => setAmount(preset)}
                        >
                            ${preset}
                        </Button>
                    ))}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="donation-amount">Custom Amount (USD)</Label>
                    <Input 
                        id="donation-amount" 
                        type="number" 
                        value={amount} 
                        onChange={(e) => setAmount(Number(e.target.value))} 
                        min="1"
                        step="1"
                    />
                </div>
                 {isProcessing && (
                    <div className="flex justify-center items-center gap-2">
                        <LoaderCircle className="animate-spin" />
                        <span>Processing donation...</span>
                    </div>
                )}
                {PAYPAL_CLIENT_ID && user ? (
                    <PayPalScriptProvider options={{ "clientId": PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
                        <PayPalButtons 
                            style={{ layout: "vertical", label: "donate" }}
                            createOrder={handleCreateOrder}
                            onApprove={handleOnApprove}
                            disabled={isProcessing}
                        />
                    </PayPalScriptProvider>
                ) : (
                    <p className="text-center text-sm text-destructive">
                        { !user ? "Please log in to make a donation." : "PayPal is not configured." }
                    </p>
                )}
            </div>
        </DialogContent>
    </Dialog>
  );
}
