
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Share2, Shield, Coins, BarChart, Mic, Wallet, RadioTower, Bell, MessageSquareQuote, AlertTriangle, PhoneOutgoing } from 'lucide-react';
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
import React, { useState } from 'react';
import { sendBuddyAlert } from '@/actions/friends';
import { cn } from '@/lib/utils';


function BuddyAlertButton() {
  const { user, userProfile } = useUserData();
  const { toast } = useToast();
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const buddiesCount = userProfile?.buddies?.length || 0;

  const handleSendBuddyAlert = () => {
    if (!user) return;
    setIsSendingAlert(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = await sendBuddyAlert(user.uid, { latitude, longitude });

        if (result.success) {
          toast({ title: "Buddy Alert Sent", description: "Your buddies have been notified of your location." });
        } else {
          toast({ variant: 'destructive', title: "Alert Failed", description: result.error || "Could not send the alert." });
        }
        setIsDialogOpen(false);
        setIsSendingAlert(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({ variant: 'destructive', title: "Location Error", description: "Could not get your current location." });
        setIsDialogOpen(false);
        setIsSendingAlert(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  
  if (buddiesCount === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="default"
            size="icon"
            className="h-12 w-12 font-bold bg-blue-500 hover:bg-blue-600 text-white disabled:bg-blue-500/50"
            disabled
            aria-label="Buddy Alert (disabled)"
          >
            <AlertTriangle className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Add buddies in 'My Account' to use this feature.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="icon"
                className="h-12 w-12 font-bold bg-blue-500 hover:bg-blue-600 text-white"
              >
                <AlertTriangle className="h-6 w-6" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Send Buddy Alert</p>
          </TooltipContent>
        </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Buddy Alert?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send an in-app notification with your current location to all {buddiesCount} of your buddies. This is not an emergency SOS.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSendBuddyAlert} disabled={isSendingAlert}>
              {isSendingAlert && <LoaderCircle className="animate-spin mr-2" />}
              Confirm & Send
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
          {loading ? (
             <SidebarMenuItem>
                <SidebarMenuButton disabled>
                  <LoaderCircle className="animate-spin" />
                  Loading...
                </SidebarMenuButton>
            </SidebarMenuItem>
           ) : user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/'} prefetch={true}>
                  <Link href="/" onClick={closeSidebar}>
                    <Share2 />
                    SyncHub
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
                    <SidebarMenuButton asChild isActive={pathname === '/'}>
                        <Link href="/" onClick={closeSidebar}>
                            <Share2 />
                            SyncHub
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
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
        <TooltipProvider>
          <div className="flex items-center justify-start gap-2 w-full">
              {user ? (
                  <>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={copyReferralLink}>
                                <Share2 className="h-5 w-5" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>Copy Referral Link</p></TooltipContent>
                      </Tooltip>
                      <BuyTokens variant="icon" />
                      <DonateButton variant="icon" />
                      <BuddyAlertButton />
                  </>
              ) : (
                  <>
                      <DonateButton variant="icon" />
                  </>
              )}
          </div>
        </TooltipProvider>
      </SidebarFooter>
    </Sidebar>
  );
}
