
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
// import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js"; // Temporarily removed
// import type { OnApproveData, CreateOrderActions } from "@paypal/paypal-js"; // Temporarily removed
// import { createPayPalOrder, capturePayPalOrder } from '@/actions/paypal'; // Temporarily removed
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

  const currentPrice = (tokenAmount * 0.01).toFixed(2);


  const handleBuyClick = () => {
    toast({
        variant: 'destructive',
        title: 'Feature Disabled',
        description: 'The payment system is temporarily unavailable. Please check back later.',
    });
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
                    <TooltipContent side="top"><p>Buy Tokens (Disabled)</p></TooltipContent>
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
                    The payment system is temporarily disabled. Please check back later.
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
                <Button className="w-full" onClick={handleBuyClick} disabled>
                    Payments Unavailable
                </Button>
            </div>
        </DialogContent>
    </Dialog>
  );
}
