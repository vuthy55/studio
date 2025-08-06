
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
import { Heart } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface DonateButtonProps {
    variant?: 'button' | 'icon';
}

export default function DonateButton({ variant = 'button' }: DonateButtonProps) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [amount, setAmount] = useState(10.00);
  const [dialogOpen, setDialogOpen] = useState(false);

  const presetAmounts = [5, 10, 15];

  const handleDonateClick = () => {
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
                                <Heart className="h-5 w-5" />
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Donate (Disabled)</p></TooltipContent>
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
                   The payment system is temporarily unavailable. Thank you for your consideration!
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
                <Button className="w-full" onClick={handleDonateClick} disabled>
                    Payments Unavailable
                </Button>
                 {!user && <p className="text-center text-sm text-destructive">Please log in to make a donation.</p>}
            </div>
        </DialogContent>
    </Dialog>
  );
}
