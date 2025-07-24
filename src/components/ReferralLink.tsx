
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import { cn } from '@/lib/utils';
import { Label } from './ui/label';

interface ReferralLinkProps {
    variant?: 'card' | 'sidebar';
}

export default function ReferralLink({ variant = 'card' }: ReferralLinkProps) {
    const { user } = useUserData();
    const { toast } = useToast();
    const [referralLink, setReferralLink] = useState('');

    useEffect(() => {
        if (user?.uid && typeof window !== 'undefined') {
            setReferralLink(`${window.location.origin}/login?ref=${user.uid}`);
        }
    }, [user]);

    const copyToClipboard = () => {
        if (referralLink) {
            navigator.clipboard.writeText(referralLink);
            toast({ title: "Copied!", description: "Referral link copied to clipboard." });
        }
    };

    if (!user) return null;

    if (variant === 'sidebar') {
        return (
            <Button 
                variant="ghost" 
                size="icon"
                onClick={copyToClipboard}
                disabled={!referralLink}
            >
                <Share2 className="h-5 w-5" />
            </Button>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Referral Link</CardTitle>
                <CardDescription>Share this link with your friends. When they sign up, you'll both get a token bonus!</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                    <Input value={referralLink} readOnly />
                    <Button type="button" size="icon" onClick={copyToClipboard} disabled={!referralLink}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
