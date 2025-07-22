
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Share2, TestTube, Shield, Coins, BarChart, Mic, Wallet, RadioTower } from 'lucide-react';
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
import NotificationBell from './NotificationBell';


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

          {/* Test pages */}
          <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/test'}>
                  <Link href="/test" onClick={closeSidebar}>
                      <TestTube /> Test Genkit
                  </Link>
              </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/test-speech'}>
                  <Link href="/test-speech" onClick={closeSidebar}>
                      <Mic /> Test Speech
                  </Link>
              </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/test-autodetect'}>
                <Link href="/test-autodetect" onClick={closeSidebar}>
                    <RadioTower /> Test Auto-Detect
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

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
