
"use client";

import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import ConversePageContent from '@/components/synchub/ConversePageContent';

export default function ConversePage() {
    const { isMobile } = useSidebar();

    return (
        <div className="space-y-8">
             <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    {isMobile && <SidebarTrigger />}
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Converse</h1>
                        <p className="text-muted-foreground">Practice your language skills with an AI tutor.</p>
                    </div>
                </div>
            </header>
            
            <ConversePageContent />
        </div>
    );
}
