
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle, Languages } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
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
import { useEffect, useState } from 'react';

function SidebarUserMenu() {
  const pathname = usePathname();
  const [user, loading] = useAuthState(auth);
  const { toast } = useToast();
  const { setOpenMobile } = useSidebar();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast({ title: 'Success', description: 'You have been logged out.' });
      closeSidebar();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
    }
  };
  
  const closeSidebar = () => setOpenMobile(false);

  if (!isClient || loading) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled>
          <LoaderCircle className="animate-spin" />
          Loading...
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (user) {
    return (
      <>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === '/profile'} onClick={closeSidebar}>
            <Link href="/profile">
              <User />
              Profile
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
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname === '/login'} onClick={closeSidebar}>
        <Link href="/login">
          <LogIn />
          Login
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}


export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  
  const closeSidebar = () => setOpenMobile(false);

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="font-headline text-2xl font-bold text-primary">VibeSync</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/'} onClick={closeSidebar}>
              <Link href="/">
                <BookOpen />
                Learn
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/interpret')} onClick={closeSidebar}>
              <Link href="/interpret">
                <Languages />
                PocketPal
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith('/converse')} onClick={closeSidebar}>
              <Link href="/converse">
                <MessagesSquare />
                Converse
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarUserMenu />

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          <a href="https://paypal.me/your-paypal" target="_blank" rel="noopener noreferrer">
            <Heart className="mr-2 h-4 w-4" /> Donate
          </a>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
