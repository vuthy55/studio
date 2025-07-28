
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
import { LoaderCircle, Wallet } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import type { OnApproveData, CreateOrderActions } from "@paypal/paypal-js";
import { createPayPalOrder, capturePayPalOrder } from '@/actions/paypal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

interface BuyTokensProps {
  variant?: 'button' | 'icon';
}

const tokenPackages = [
    { tokens: 500, price: 5.00, bonus: 0 },
    { tokens: 1200, price: 10.00, bonus: 200 },
    { tokens: 3000, price: 25.00, bonus: 500 },
]

export default function BuyTokens({ variant = 'button' }: BuyTokensProps) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [tokenAmount, setTokenAmount] = useState(500);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const currentPrice = (tokenAmount * 0.01).toFixed(2);


  if (!paypalClientId) {
    console.error("PayPal Client ID is not configured.");
    return null; // Don't render if PayPal is not set up
  }

  const createOrder = async (data: Record<string, unknown>, actions: CreateOrderActions) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to buy tokens.' });
        return '';
    }
    if (tokenAmount <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a positive number of tokens.' });
        return '';
    }
    
    // Note: We don't set isProcessing here because the PayPal button has its own loading state.
    const res = await createPayPalOrder({ 
        userId: user.uid, 
        orderType: 'tokens',
        value: tokenAmount 
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
        toast({ title: 'Success!', description: result.message });
        setDialogOpen(false);
    } else {
        // Updated error handling to be more descriptive
        let description = 'An unknown error occurred.';
        try {
            // Check if the message contains a JSON object
            const jsonString = result.message.substring(result.message.indexOf('{'));
            const errorObj = JSON.parse(jsonString);
            description = `Error: ${errorObj.message || 'See console for full details.'}\nDetails: ${jsonString}`;
        } catch (e) {
            description = result.message; // Fallback if parsing fails
        }
        
        toast({ 
            variant: 'destructive', 
            title: 'Payment Capture Failed', 
            description: <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4"><code className="text-white">{description}</code></pre>,
            duration: 10000,
        });
        console.error("Full server error details:", result.message);
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
                                <Wallet className="h-5 w-5" />
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Buy Tokens</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
            <DialogTrigger asChild>
                <Button className="w-full">
                    <Wallet className="mr-2 h-4 w-4" />
                    Buy Tokens
                </Button>
            </DialogTrigger>
        )}
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Buy More Tokens</DialogTitle>
                <DialogDescription>
                    Select a package or enter a custom amount. 100 tokens = $1.00 USD.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                 <div className="grid grid-cols-3 gap-2">
                    {tokenPackages.map(pkg => (
                        <Button 
                            key={pkg.tokens}
                            variant="outline"
                            className={cn("h-auto flex-col relative py-2", tokenAmount === pkg.tokens && 'border-primary ring-2 ring-primary')}
                            onClick={() => setTokenAmount(pkg.tokens)}
                        >
                             {pkg.bonus > 0 && <Badge className="absolute -top-2 -right-2">+{pkg.bonus} Free!</Badge>}
                            <span className="text-xl font-bold">{pkg.tokens}</span>
                            <span className="text-xs text-muted-foreground">${pkg.price.toFixed(2)}</span>
                        </Button>
                    ))}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="token-amount">Custom Amount</Label>
                    <Input 
                        id="token-amount" 
                        type="number" 
                        value={tokenAmount} 
                        onChange={(e) => setTokenAmount(Number(e.target.value))} 
                        min="1"
                        step="100"
                        placeholder="e.g., 500"
                    />
                </div>
                <div className="text-center font-bold text-lg">
                    Total: ${currentPrice} USD
                </div>
                
                {isProcessing && (
                     <div className="flex justify-center items-center h-24">
                        <LoaderCircle className="h-8 w-8 animate-spin" />
                        <p className="ml-2">Processing your order...</p>
                    </div>
                )}
                
                <div style={{ display: isProcessing ? 'none' : 'block' }}>
                    <PayPalScriptProvider options={{ "clientId": paypalClientId, currency: "USD", intent: "capture" }}>
                        <PayPalButtons 
                            style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay" }}
                            createOrder={createOrder}
                            onApprove={onApprove}
                            onError={onError}
                            disabled={isProcessing}
                        />
                    </PayPalScriptProvider>
                </div>
            </div>
        </DialogContent>
    </Dialog>
  );
}
