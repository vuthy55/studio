
"use client";

import Link from 'next/link';
import { Coins, User } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useUserData } from "@/context/UserDataContext";
import NotificationBell from "./NotificationBell";
import { SidebarTrigger } from "../ui/sidebar";
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';


interface MainHeaderProps {
    title: string;
    description: string;
}

export default function MainHeader({ title, description }: MainHeaderProps) {
    const { user, userProfile } = useUserData();

    return (
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                    <h1 className="text-3xl font-bold font-headline">{title}</h1>
                    <p className="text-muted-foreground">{description}</p>
                </div>
            </div>
             <div className="flex items-center justify-end gap-2 w-full md:w-auto">
                <NotificationBell />
                {user && userProfile && (
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/profile" passHref legacyBehavior>
                                    <Button asChild variant="ghost" size="icon">
                                        <a>
                                            <User className="h-5 w-5" />
                                            <span className="sr-only">My Account</span>
                                        </a>
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                               <div className="text-center p-2">
                                    <p className="font-semibold">Welcome, {userProfile.name || user.email}</p>
                                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-amber-500 mt-1">
                                        <Coins className="h-4 w-4" />
                                        <span>{userProfile?.tokenBalance ?? 0} Tokens</span>
                                    </div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
        </header>
    );
}
