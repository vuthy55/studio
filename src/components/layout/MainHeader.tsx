
"use client";

import Link from 'next/link';
import { Coins, User } from "lucide-react";
import React, { useState, useEffect } from 'react';

import { useSidebar } from "@/components/ui/sidebar";
import { useUserData } from "@/context/UserDataContext";
import NotificationBell from "./NotificationBell";
import { SidebarTrigger } from "../ui/sidebar";
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';


interface MainHeaderProps {
    title: string;
    description: string;
    children?: React.ReactNode;
}

export default function MainHeader({ title, description, children }: MainHeaderProps) {
    const { user, userProfile } = useUserData();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

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
                {children}
                {isClient && user && userProfile && (
                    <>
                        <NotificationBell />
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" asChild>
                                    <Link href="/profile">
                                        <User className="h-5 w-5" />
                                        <span className="sr-only">My Account</span>
                                    </Link>
                                    </Button>
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
                    </>
                )}
            </div>
        </header>
    );
}
