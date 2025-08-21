
"use client";

import { PayPalScriptProvider } from '@paypal/react-paypal-js';

const isProduction = process.env.NODE_ENV === 'production';

const PAYPAL_CLIENT_ID = isProduction 
    ? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE || ''
    : process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || '';


export function AppProviders({ children }: { children: React.ReactNode }) {
    if (!PAYPAL_CLIENT_ID) {
        console.error("PayPal Client ID is not configured. PayPal buttons will not work.");
        return <>{children}</>;
    }

    return (
        <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
            {children}
        </PayPalScriptProvider>
    );
}

    