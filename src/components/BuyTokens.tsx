
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
import { LoaderCircle, Wallet } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import type { OnApproveData } from "@paypal/paypal-js";
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
  const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || '';


  const currentPrice = (tokenAmount * 0.01).toFixed(2);

  const handleCreateOrder = async (): Promise<string> => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to make a purchase.' });
        throw new Error("User not logged in.");
    }
    
    const { orderID, error } = await createPayPalOrder({
        userId: user.uid,
        orderType: 'tokens',
        value: tokenAmount,
    });

    if (error || !orderID) {
        const description = `Details: ${error || 'The server did not return an order ID.'}`;
        toast({ variant: 'destructive', title: 'Order Creation Failed', description, duration: 20000 });
        throw new Error(error || 'Could not create PayPal order.');
    }
    return orderID;
  };

  const handleOnApprove = async (data: OnApproveData) => {
      setIsProcessing(true);
      if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'Cannot process payment without a user session.'});
        setIsProcessing(false);
        return;
      }
      try {
          const result = await capturePayPalOrder(data.orderID, user.uid);
          if (result.success) {
              toast({ title: 'Payment Successful!', description: result.message });
          } else {
              throw new Error(result.message);
          }
      } catch (error: any) {
          toast({ variant: 'destructive', title: 'Payment Error', description: error.message || 'There was an issue processing your payment.' });
      } finally {
          setIsProcessing(false);
          setDialogOpen(false);
      }
  };

  const onError = (err: any) => {
      console.error("PayPal Error:", err);
      toast({ variant: 'destructive', title: 'PayPal Error', description: 'An error occurred with the PayPal transaction.'});
  };

  if (!PAYPAL_CLIENT_ID) {
    return (
      <Button disabled>
        <Wallet className="mr-2 h-4 w-4" />
        Payments Unavailable
      </Button>
    )
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
             <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
                <DialogHeader>
                    <DialogTitle>Buy More Tokens</DialogTitle>
                    <DialogDescription>
                        Choose a package or enter a custom amount.
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
                        <div className="flex justify-center items-center gap-2">
                            <LoaderCircle className="animate-spin" />
                            <span>Processing payment...</span>
                        </div>
                    )}
                    <PayPalButtons 
                        style={{ layout: "vertical", label: "pay" }}
                        createOrder={handleCreateOrder}
                        onApprove={handleOnApprove}
                        onError={onError}
                        disabled={isProcessing}
                    />
                    {!user && <p className="text-center text-sm text-destructive">Please log in to make a purchase.</p>}
                </div>
            </PayPalScriptProvider>
        </DialogContent>
    </Dialog>
  );
}
