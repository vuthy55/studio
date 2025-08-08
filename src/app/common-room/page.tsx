import { Suspense } from 'react';
import { LoaderCircle } from 'lucide-react';
import CommonRoomClient from './CommonRoomClient';
import { TourProvider } from '@/context/TourContext';
import Tour from '@/components/tour/Tour';

// Note: This page is now a Server Component, which is the default in Next.js App Router.
// All client-side logic has been moved to CommonRoomClient.tsx.
export default function CommonRoomPage({
    searchParams
}: {
    searchParams: { [key: string]: string | string[] | undefined }
}) {
    const initialTab = typeof searchParams.tab === 'string' ? searchParams.tab : 'public-vibes';
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <TourProvider>
                <CommonRoomClient initialTab={initialTab} />
                <Tour/>
            </TourProvider>
        </Suspense>
    );
}