import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import ClientSidebar from '@/components/layout/client-sidebar';
import { LanguageProvider } from '@/context/LanguageContext';
import { UserDataProvider } from '@/context/UserDataContext';
import MainHeader from '@/components/layout/MainHeader';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';

export const metadata: Metadata = {
  title: 'VibeSync',
  description: 'A modern minimal web app for backpackers in South East Asia.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <div style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            border: '2px solid red',
            padding: '10px',
            backgroundColor: 'rgba(255, 220, 220, 0.9)',
            color: 'red',
            zIndex: 9999,
            fontWeight: 'bold',
            borderRadius: '8px'
        }}>
            DEBUG CONTROL TEST
        </div>
        <UserDataProvider>
          <LanguageProvider>
            <TourProvider>
              <SidebarProvider>
                <ClientSidebar />
                <SidebarInset>
                  <main className="relative flex-1 p-4 sm:p-6 lg:p-8">
                    {children}
                  </main>
                </SidebarInset>
                <Toaster />
                <Tour />
              </SidebarProvider>
            </TourProvider>
          </LanguageProvider>
        </UserDataProvider>
      </body>
    </html>
  );
}
