
"use client"
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Share2, Shield, Coins, BarChart, Mic, RadioTower, Bell, MessageSquareQuote, AlertTriangle, PhoneOutgoing, Info, LifeBuoy, Compass, FlaskConical, Languages, MessageCircle, Settings, Users as UsersIcon } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter,
  SidebarHeader,
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarSeparator,
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
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';


function BuddyAlertButton() {
  const { user, userProfile } = useUserData();
  const { toast } = useToast();
  const router = useRouter();
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const buddiesCount = userProfile?.buddies?.length || 0;

  const confirmAndSend = () => {
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
  
  const handleSendBuddyAlert = () => {
    if (!user) return;
    
    if (buddiesCount === 0) {
      router.push('/profile?tab=buddies');
      toast({
        title: "Add a Buddy",
        description: "You need to add at least one buddy to use this feature."
      });
      return;
    }
    
    if (userProfile?.immediateBuddyAlert) {
        confirmAndSend();
    } else {
        setIsDialogOpen(true);
    }
  };

  return (
     <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <AlertDialogTrigger asChild>
          <Button
            onClick={handleSendBuddyAlert}
            variant="default"
            size="icon"
            className="h-12 w-12 font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            aria-label="Send Buddy Alert"
          >
            <AlertTriangle className="h-6 w-6" strokeWidth={2.5} />
          </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Buddy Alert?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send an in-app notification with your current location to all {buddiesCount} of your buddies.
            <br/><br/>
            <strong className="font-semibold">For a faster experience next time:</strong> You can enable "Immediate Buddy Alert" in your account settings. You can also grant your browser permanent location access for this site to avoid future permission prompts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmAndSend} disabled={isSendingAlert}>
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
  const router = useRouter();
  
  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: 'Success', description: 'You have been logged out.' });
      router.push('/'); // Redirect to homepage on logout
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

  const mainNavLinks = [
    { href: "/", icon: Home, label: "Home", activePath: "/" },
    { href: "/test-download", icon: FlaskConical, label: "Download Test", activePath: "/test-download" },
    { href: "/learn", icon: Languages, label: "Learn", activePath: "/learn" },
    { href: "/converse", icon: Mic, label: "Converse", activePath: "/converse" },
    { href: "/connect", icon: UsersIcon, label: "Connect", activePath: "/connect" },
    { href: "/infohub", icon: Compass, label: "Intel", activePath: "/infohub" },
  ];

  const userNavLinks = [
    { href: "/profile", icon: User, label: "My Profile", activePath: "/profile" },
  ];
  
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="font-headline text-2xl font-bold text-primary" onClick={closeSidebar}>
          VibeSync
          <sup className="text-xs font-bold text-black ml-1">Beta</sup>
        </Link>
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
              {mainNavLinks.map(link => (
                 <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={pathname === link.href}>
                      <Link href={link.href} onClick={closeSidebar}>
                        <link.icon />
                        {link.label}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
              ))}
              
              <SidebarSeparator />

              {userNavLinks.map(link => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(link.activePath)}>
                    <Link href={link.href} onClick={closeSidebar}>
                      <link.icon />
                      {link.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              {userProfile?.role === 'admin' && (
                <>
                  <SidebarSeparator />
                  <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname?.startsWith('/admin')}>
                          <Link href="/admin" onClick={closeSidebar}>
                          <Settings />
                          Admin
                          </Link>
                      </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
              <SidebarSeparator />
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
                        <Home />
                        Home
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/login'}>
                    <Link href="/login" onClick={closeSidebar}>
                        <LogIn />
                        Login / Sign Up
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
             </>
          )}

        </SidebarMenu>
      </SidebarContent>
       <SidebarFooter>
        {user && (
            <div className="mb-2">
                <Link href="/feedback" onClick={closeSidebar}>
                    <div className="flex items-center justify-center p-2 rounded-lg bg-accent/50 text-accent-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors">
                        <LifeBuoy className="h-5 w-5 mr-2"/>
                        <span className="font-semibold text-sm">Give Feedback</span>
                    </div>
                </Link>
            </div>
        )}
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
                          <TooltipContent side="right"><p>Copy Referral Link</p></TooltipContent>
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
