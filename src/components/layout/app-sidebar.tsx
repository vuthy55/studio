
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Share2, TestTube, Shield, Coins, BarChart, Mic, Wallet } from 'lucide-react';
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
import ReferralLink from '../ReferralLink';


export function AppSidebar() {
  const pathname = usePathname();
  const { user, loading, userProfile } = useUserData();
  const { toast } = useToast();
  const { setOpenMobile } = useSidebar();
  
  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast({ title: 'Success', description: 'You have been logged out.' });
      setOpenMobile(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
    }
  };
  
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="font-headline text-2xl font-bold text-primary">VibeSync</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/'} prefetch={true}>
              <Link href="/" onClick={() => setOpenMobile(false)}>
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
                    <Link href="/admin" onClick={() => setOpenMobile(false)}>
                      <Shield />
                      Admin
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
               <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/stats'}>
                  <Link href="/stats" onClick={() => setOpenMobile(false)}>
                    <BarChart />
                    My Stats
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/profile'} prefetch={true}>
                  <Link href="/profile" onClick={() => setOpenMobile(false)}>
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
                  <Link href="/login" onClick={() => setOpenMobile(false)}>
                    <LogIn />
                    Login
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
             </>
          )}

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="flex-col items-stretch gap-y-2">
        {user && (
          <>
            <ReferralLink variant="sidebar" />
            <div className="flex items-center justify-center gap-2 text-sm font-bold text-amber-500 border rounded-full p-2">
              <Coins className="h-5 w-5" />
              <span>{userProfile?.tokenBalance ?? 0}</span>
            </div>
            <BuyTokens />
          </>
        )}
        <DonateButton />
      </SidebarFooter>
    </Sidebar>
  );
}
