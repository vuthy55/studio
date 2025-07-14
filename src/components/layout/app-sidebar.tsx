"use client"
import Link from 'next/link';
import { BookOpen, MessagesSquare, User, Heart } from 'lucide-react';
import { 
  Sidebar, 
  SidebarHeader, 
  SidebarContent, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarFooter 
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="font-headline text-2xl font-bold text-primary">LinguaGo</Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive>
              <Link href="/">
                <BookOpen />
                Learn
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="#">
                <MessagesSquare />
                Converse
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="#">
                <User />
                Profile
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
