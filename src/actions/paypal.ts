
'use server';

// import paypal from '@paypal/checkout-server-sdk'; // Temporarily removed
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface CreateOrderPayload {
    userId: string;
    orderType: 'tokens' | 'donation';
    value: number; // For 'tokens', this is the token amount. For 'donation', this is the dollar amount.
}

// --- PayPal Client Setup ---
function getPayPalClient() {
  // const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID; // Temporarily removed
  // const clientSecret = process.env.PAYPAL_CLIENT_SECRET; // Temporarily removed
  throw new Error('PayPal functionality is temporarily disabled.');
}

// --- Server Action: Create an order ---
export async function createPayPalOrder(payload: CreateOrderPayload): Promise<{orderID?: string, error?: string}> {
  console.error("createPayPalOrder is called, but PayPal functionality is temporarily disabled.");
  return { error: 'Payment processing is temporarily disabled. Please try again later.' };
}

// --- Server Action: Capture an order ---
export async function capturePayPalOrder(orderID: string): Promise<{success: boolean, message: string}> {
  console.error("capturePayPalOrder is called, but PayPal functionality is temporarily disabled.");
  return { success: false, message: 'Payment processing is temporarily disabled. Please try again later.'};
}
