
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';


interface CreateOrderPayload {
    userId: string;
    orderType: 'tokens' | 'donation';
    value: number; // For 'tokens', this is the token amount. For 'donation', this is the dollar amount.
}

// --- PayPal Client Setup ---
function getPayPalClient() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal client ID or secret is not configured on the server.');
  }
  
  // The new SDK handles environment configuration differently. We'll use the API directly.
  return {
      clientId,
      clientSecret,
      environment: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'
  };
}

async function getAccessToken({ clientId, clientSecret, environment }: ReturnType<typeof getPayPalClient>) {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = environment === 'live' ? 'https://api-m.paypal.com/v1/oauth2/token' : 'https://api-m.sandbox.paypal.com/v1/oauth2/token';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });
    const data = await response.json();
    return data.access_token;
}

// --- Server Action: Create an order ---
export async function createPayPalOrder(payload: CreateOrderPayload): Promise<{orderID?: string, error?: string}> {
    const { orderType, value } = payload;
    let purchaseAmount = '0.01'; // Default to a small amount

    if (orderType === 'tokens') {
        // Assume 100 tokens = $1, so 1 token = $0.01
        purchaseAmount = (value * 0.01).toFixed(2);
    } else if (orderType === 'donation') {
        purchaseAmount = value.toFixed(2);
    }

    if (parseFloat(purchaseAmount) <= 0) {
        return { error: 'Invalid purchase amount.' };
    }

    const client = getPayPalClient();
    const accessToken = await getAccessToken(client);
    const url = client.environment === 'live' ? 'https://api-m.paypal.com/v2/checkout/orders' : 'https://api-m.sandbox.paypal.com/v2/checkout/orders';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: purchaseAmount,
                    },
                }],
            })
        });

        const orderData = await response.json();
        
        if (response.ok) {
            return { orderID: orderData.id };
        } else {
             throw new Error(orderData.message || 'Failed to create PayPal order.');
        }

    } catch (error: any) {
        console.error("Error creating PayPal order:", error.message);
        return { error: 'Failed to create PayPal order on the server.' };
    }
}

// --- Server Action: Capture an order ---
export async function capturePayPalOrder(orderID: string, userId: string): Promise<{success: boolean, message: string}> {
    
    const client = getPayPalClient();
    const accessToken = await getAccessToken(client);
    const url = client.environment === 'live' ? `https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture` : `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const orderData = await response.json();
        
        if (!response.ok) {
            throw new Error(orderData.message || 'Payment was not completed.');
        }

        if (orderData.status === 'COMPLETED') {
            const purchaseUnit = orderData.purchase_units[0];
            const amountPaid = parseFloat(purchaseUnit.payments.captures[0].amount.value);
            const currency = purchaseUnit.payments.captures[0].amount.currency_code;
            
            // Calculate tokens based on the amount paid (100 tokens per dollar)
            const tokensEarned = Math.round(amountPaid * 100);

            // Fetch app settings to check for bonus tokens
            const settings = await getAppSettingsAction();
            let bonusTokens = 0;
            if (amountPaid === 10.00) bonusTokens = settings.referralBonus || 0; // Re-using referralBonus for a simple package deal
            if (amountPaid >= 25.00) bonusTokens = 500;
            
            const totalTokens = tokensEarned + bonusTokens;
            
            const userRef = db.collection('users').doc(userId);
            const batch = db.batch();

            // 1. Update user's token balance
            batch.update(userRef, { tokenBalance: FieldValue.increment(totalTokens) });

            // 2. Log the token transaction
            const tokenLogRef = userRef.collection('transactionLogs').doc();
            batch.set(tokenLogRef, {
                actionType: 'purchase',
                tokenChange: totalTokens,
                timestamp: FieldValue.serverTimestamp(),
                description: `Purchased ${tokensEarned} tokens (+${bonusTokens} bonus) via PayPal.`,
            });
            
            // 3. Log the financial transaction in a separate history
            const paymentHistoryRef = userRef.collection('paymentHistory').doc(orderID);
            batch.set(paymentHistoryRef, {
                orderId: orderID,
                amount: amountPaid,
                currency: currency,
                status: 'COMPLETED',
                tokensPurchased: tokensEarned,
                createdAt: FieldValue.serverTimestamp(),
            });
            
            // 4. Also log to a central financial ledger for admin auditing
            const centralLedgerRef = db.collection('financialLedger').doc();
             batch.set(centralLedgerRef, {
                type: 'revenue',
                source: 'paypal',
                description: `Token Purchase: ${tokensEarned} tokens`,
                amount: amountPaid,
                orderId: orderID,
                userId: userId,
                timestamp: FieldValue.serverTimestamp(),
            });

            await batch.commit();

            return { success: true, message: `Successfully purchased ${totalTokens} tokens!` };
        } else {
             return { success: false, message: 'Payment was not completed.' };
        }

    } catch (error: any) {
        console.error("Error capturing PayPal order:", error.message);
        return { success: false, message: 'Failed to capture payment on the server.' };
    }
}


// --- Server Action: Capture a donation ---
export async function capturePayPalDonation(orderID: string, userId: string, amount: number): Promise<{success: boolean, message: string}> {
    
    const client = getPayPalClient();
    const accessToken = await getAccessToken(client);
    const url = client.environment === 'live' ? `https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture` : `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const orderData = await response.json();
        
        if (!response.ok) {
            throw new Error(orderData.message || 'Donation payment was not completed.');
        }

        if (orderData.status === 'COMPLETED') {
            const purchaseUnit = orderData.purchase_units[0];
            const amountPaid = parseFloat(purchaseUnit.payments.captures[0].amount.value);
            const currency = purchaseUnit.payments.captures[0].amount.currency_code;
            
            const userRef = db.collection('users').doc(userId);
            const batch = db.batch();

            // 1. Log the financial transaction in the user's payment history
            const paymentHistoryRef = userRef.collection('paymentHistory').doc(orderID);
            batch.set(paymentHistoryRef, {
                orderId: orderID,
                amount: amountPaid,
                currency: currency,
                status: 'COMPLETED',
                tokensPurchased: 0, // Explicitly 0 for donations
                createdAt: FieldValue.serverTimestamp(),
            });
            
            // 2. Also log to a central financial ledger for admin auditing
            const centralLedgerRef = db.collection('financialLedger').doc();
             batch.set(centralLedgerRef, {
                type: 'revenue',
                source: 'paypal-donation',
                description: `Donation`,
                amount: amountPaid,
                orderId: orderID,
                userId: userId,
                timestamp: FieldValue.serverTimestamp(),
            });

            await batch.commit();

            return { success: true, message: `Thank you for your generous donation of ${amountPaid} ${currency}!` };
        } else {
             return { success: false, message: 'Donation was not completed.' };
        }

    } catch (error: any) {
        console.error("Error capturing PayPal donation:", error.message);
        return { success: false, message: 'Failed to capture donation on the server.' };
    }
}
