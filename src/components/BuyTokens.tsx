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
import { PayPalScriptProvider, PayPalButtons, OnApproveData } from "@paypal/react-paypal-js";
import { createPayPalOrder, capturePayPalOrder } from '@/actions/paypal';


export default function BuyTokens() {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [tokenAmount, setTokenAmount] = useState(500); // Default to 500 tokens ($5.00)
  const [isProcessing, setIsProcessing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!paypalClientId) {
    console.error("PayPal Client ID is not configured.");
    return null; // Don't render if PayPal is not set up
  }

  const createOrder = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to buy tokens.' });
        return '';
    }
    if (tokenAmount <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a positive number of tokens.' });
        return '';
    }
    setIsProcessing(true);
    try {
        const { orderID } = await createPayPalOrder(user.uid, tokenAmount);
        return orderID;
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Error', description: `Could not create PayPal order: ${err.message}` });
        setIsProcessing(false);
        return '';
    }
  };

  const onApprove = async (data: OnApproveData) => {
    setIsProcessing(true);
    try {
        const result = await capturePayPalOrder(data.orderID);

        if (result.success) {
            toast({ title: 'Success (Test Mode)!', description: `PayPal payment captured. Token grant is disabled for this test.` });
            setDialogOpen(false); // Close dialog on success
        } else {
            throw new Error(result.message || 'An unknown error occurred during payment capture.');
        }
    } catch (err: any) {
        console.error("onApprove error:", err);
        toast({ variant: 'destructive', title: 'Payment Failed', description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const onError = (err: any) => {
    toast({ variant: 'destructive', title: 'PayPal Error', description: 'An error occurred with the PayPal transaction. Check console for details.' });
    console.error("PayPal Button onError:", err);
    setIsProcessing(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
            <Button>
                <Wallet className="mr-2 h-4 w-4" />
                Buy Tokens
            </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Buy More Tokens</DialogTitle>
                <DialogDescription>
                    1 Token = $0.01 USD. Select an amount and complete your purchase with PayPal.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="token-amount">Number of Tokens</Label>
                    <Input 
                        id="token-amount" 
                        type="number" 
                        value={tokenAmount} 
                        onChange={(e) => setTokenAmount(Number(e.target.value))} 
                        min="1"
                        step="100"
                    />
                </div>
                <div className="text-center font-bold text-lg">
                    Total: ${(tokenAmount * 0.01).toFixed(2)} USD
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
