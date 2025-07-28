
"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Heart } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import type { OnApproveData, CreateOrderActions } from "@paypal/paypal-js";
import { createPayPalOrder, capturePayPalOrder } from '@/actions/paypal';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface DonateButtonProps {
    variant?: 'button' | 'icon';
}

export default function DonateButton({ variant = 'button' }: DonateButtonProps) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [amount, setAmount] = useState(10.00);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const presetAmounts = [5, 10, 15];

  if (!paypalClientId) {
    console.error("PayPal Client ID is not configured.");
    return (
       <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled>
          <a href="#" rel="noopener noreferrer">
            <Heart className="mr-2 h-4 w-4" /> Donate (Unavailable)
          </a>
        </Button>
    );
  }

  const createOrder = async (data: Record<string, unknown>, actions: CreateOrderActions) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to make a donation.' });
        return '';
    }
    if (amount <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a positive donation amount.' });
        return '';
    }
    
    const res = await createPayPalOrder({ 
        userId: user.uid, 
        orderType: 'donation', 
        value: amount 
    });

    if (res.orderID) {
        return res.orderID;
    } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error || 'Could not create PayPal order.' });
        return '';
    }
  };

  const onApprove = async (data: OnApproveData) => {
    setIsProcessing(true);
    
    const result = await capturePayPalOrder(data.orderID);

    if (result.success) {
        toast({ title: 'Thank You!', description: result.message });
        setDialogOpen(false);
    } else {
        toast({ 
            variant: 'destructive', 
            title: 'Payment Capture Failed', 
            description: result.message || 'An unknown error occurred.',
        });
    }

    setIsProcessing(false);
  };

  const onError = (err: any) => {
    toast({ variant: 'destructive', title: 'PayPal Error', description: 'An error occurred with the PayPal transaction. Check console for details.' });
    console.error("PayPal Button onError:", err);
    setIsProcessing(false);
  }

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
                    Thank you for considering a donation! Your support helps keep this platform running.
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
                <div className="text-center font-bold text-lg">
                    Total: ${amount.toFixed(2)} USD
                </div>
                
                {isProcessing && (
                     <div className="flex justify-center items-center h-24">
                        <LoaderCircle className="h-8 w-8 animate-spin" />
                        <p className="ml-2">Processing your donation...</p>
                    </div>
                )}
                
                <div style={{ display: isProcessing ? 'none' : 'block' }}>
                    <PayPalScriptProvider options={{ "clientId": paypalClientId, currency: "USD", intent: "capture" }}>
                        <PayPalButtons 
                            style={{ layout: "vertical", color: "blue", shape: "rect", label: "donate" }}
                            createOrder={createOrder}
                            onApprove={onApprove}
                            onError={onError}
                            disabled={isProcessing || !user}
                        />
                    </PayPalScriptProvider>
                </div>
                 {!user && <p className="text-center text-sm text-destructive">Please log in to make a donation.</p>}
            </div>
        </DialogContent>
    </Dialog>
  );
}
