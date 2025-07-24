
"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { useUserData } from "@/context/UserDataContext";
import NotificationBell from "./NotificationBell";
import { SidebarTrigger } from "../ui/sidebar";
import { Coins } from "lucide-react";

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
            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                {user && userProfile && (
                     <div className="text-right">
                        <p className="text-sm font-semibold text-foreground truncate">Welcome, {userProfile.name || user.email}</p>
                        <div className="flex items-center justify-end gap-2 text-sm font-bold text-amber-500">
                            <Coins className="h-4 w-4" />
                            <span>{userProfile?.tokenBalance ?? 0}</span>
                        </div>
                    </div>
                )}
                 <div className="md:absolute md:left-1/2 md:-translate-x-1/2">
                    <NotificationBell />
                </div>
            </div>
        </header>
    );
}
