
"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessagesSquare, User, Heart, LogIn, LogOut, LoaderCircle } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { 
  Sidebar, 
  SidebarHeader, 
  SidebarContent, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarFooter 
} from '@/components/ui/sidebar';
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';


export function AppSidebar() {
  const pathname = usePathname();
  const [user, loading] = useAuthState(auth);
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast({ title: 'Success', description: 'You have been logged out.' });
      // The auth state change will trigger redirects on protected pages
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
    }
  };
  
  return (
    <Sidebar>
      <SheetHeader className="p-4 border-b border-sidebar-border">
          <SheetTitle asChild>
            <Link href="/" className="font-headline text-2xl font-bold text-primary">LinguaGo</Link>
          </SheetTitle>
          <SheetDescription className="sr-only">Main navigation sidebar</SheetDescription>
      </SheetHeader>
      <SidebarHeader className="hidden">
        <Link href="/" className="font-headline text-2xl font-bold text-primary">LinguaGo</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/'} prefetch={true}>
              <Link href="/">
                <BookOpen />
                Learn
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/converse'} prefetch={true}>
              <Link href="/converse">
                <MessagesSquare />
                Converse
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
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/profile'} prefetch={true}>
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
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/login'}>
                <Link href="/login">
                  <LogIn />
                  Login
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          <Link href="#">
            <Heart className="mr-2 h-4 w-4" /> Donate
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
