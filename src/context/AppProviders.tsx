
"use client";

import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import React, { useState, useEffect } from 'react';

const isProduction = process.env.NODE_ENV === 'production';

const PAYPAL_CLIENT_ID = isProduction 
    ? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE || ''
    : process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || '';

export function AppProviders({ children }: { children: React.ReactNode }) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient || !PAYPAL_CLIENT_ID) {
        // Render children directly on the server or if PayPal ID is missing,
        // preventing the provider from interfering with other SDKs during initial load.
        return <>{children}</>;
    }

    return (
        <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
            {children}
        </PayPalScriptProvider>
    );
}
