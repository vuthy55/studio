
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Share2, Shield, Coins, BarChart, Mic, Wallet, RadioTower, Bell, MessageSquareQuote, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { 
  Sidebar, 
  SidebarHeader, 
  SidebarContent, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarFooter,
  useSidebar
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUserData } from '@/context/UserDataContext';
import DonateButton from '../DonateButton';
import BuyTokens from '../BuyTokens';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { sendSos } from '@/actions/sos';
import React from 'react';


function SosButton() {
    const { user, userProfile } = useUserData();
    const { toast } = useToast();
    const [isSending, setIsSending] = React.useState(false);

    const handleSendSos = () => {
        if (!userProfile?.emergencyContactPhone) {
            toast({
                variant: 'destructive',
                title: 'No Emergency Contact Set',
                description: 'Please set an emergency contact in your account profile before using the SOS feature.',
                duration: 5000,
            });
            return;
        }

        setIsSending(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const result = await sendSos({
                    name: userProfile.name || 'A VibeSync User',
                    to: userProfile.emergencyContactPhone!,
                    location: { latitude, longitude }
                });

                if (result.success) {
                    toast({ title: "SOS Sent", description: "Your emergency contact has been notified." });
                } else {
                    toast({ variant: 'destructive', title: "SOS Failed", description: result.error || "Could not send the emergency message." });
                }
                setIsSending(false);
            },
            (error) => {
                console.error("Geolocation error:", error);
                toast({ variant: 'destructive', title: "Location Error", description: "Could not get your current location. Please ensure location services are enabled." });
                setIsSending(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    return (
        <AlertDialog>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                             <Button variant="destructive" size="icon">
                                <AlertTriangle className="h-5 w-5" />
                            </Button>
                        </AlertDialogTrigger>
                    </TooltipTrigger>
                     <TooltipContent side="top"><p>Send SOS</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Emergency SOS?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will immediately send an SMS with your current location to your emergency contact:
                        <br />
                        <strong className="font-bold my-2 block">{userProfile?.emergencyContactName || 'Not Set'} ({userProfile?.emergencyContactPhone || 'Not Set'})</strong>
                        Only use this in a genuine emergency.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleSendSos} 
                        disabled={isSending}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                        {isSending ? <LoaderCircle className="animate-spin mr-2"/> : null}
                        Confirm & Send SOS
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}


export function AppSidebar() {
  const pathname = usePathname();
  const { user, loading, userProfile, logout } = useUserData();
  const { toast } = useToast();
  const { setOpenMobile } = useSidebar();
  
  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: 'Success', description: 'You have been logged out.' });
      setOpenMobile(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
    }
  };

  const copyReferralLink = () => {
    if (user?.uid && typeof window !== 'undefined') {
      const referralLink = `${window.location.origin}/login?ref=${user.uid}`;
      navigator.clipboard.writeText(referralLink);
      toast({ title: "Copied!", description: "Referral link copied to clipboard." });
    }
  };
  
  const closeSidebar = () => setOpenMobile(false);
  
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="font-headline text-2xl font-bold text-primary" onClick={closeSidebar}>VibeSync</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/'} prefetch={true}>
              <Link href="/" onClick={closeSidebar}>
                <Share2 />
                SyncHub
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
           {loading ? (
             <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <LoaderCircle className="animate-spin" />
                  Loading...
                </SidebarMenuButton>
            </SidebarMenuItem>
           ) : user ? (
            <>
              {userProfile?.role === 'admin' && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname?.startsWith('/admin')}>
                    <Link href="/admin" onClick={closeSidebar}>
                      <Shield />
                      Admin
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
               <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/stats'}>
                  <Link href="/stats" onClick={closeSidebar}>
                    <BarChart />
                    My Stats
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/notifications'}>
                    <Link href="/notifications" onClick={closeSidebar}>
                      <Bell />
                      Notifications
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/profile'} prefetch={true}>
                  <Link href="/profile" onClick={closeSidebar}>
                    <User />
                    My Account
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
               <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout}>
                  <LogOut />
                  Logout
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
             <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/login'}>
                  <Link href="/login" onClick={closeSidebar}>
                    <LogIn />
                    Login
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
             </>
          )}

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-around w-full">
            {user ? (
                 <>
                    <SosButton />
                    <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={copyReferralLink}>
                                <Share2 className="h-5 w-5" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>Copy Referral Link</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <BuyTokens variant="icon" />
                    <DonateButton variant="icon" />
                 </>
            ) : (
                <>
                    <SosButton />
                    <DonateButton variant="icon" />
                </>
            )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
