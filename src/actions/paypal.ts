
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppSettingsAction } from './settings';


interface CreateOrderPayload {
    userId: string;
    orderType: 'tokens' | 'donation';
    value: number; // For 'tokens', this is the token amount. For 'donation', this is the dollar amount.
}

async function getAccessToken(): Promise<{ accessToken?: string, error?: string }> {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const PAYPAL_CLIENT_ID = isProduction 
        ? process.env.PAYPAL_CLIENT_ID_LIVE
        : process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX;

    const PAYPAL_CLIENT_SECRET = isProduction
        ? process.env.PAYPAL_CLIENT_SECRET_LIVE
        : process.env.PAYPAL_CLIENT_SECRET_SANDBOX;
    
    const PAYPAL_API_BASE_URL = isProduction
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      const errorMsg = `CRITICAL: PayPal ${isProduction ? 'Live' : 'Sandbox'} environment variables are missing.`;
      console.error(errorMsg);
      return { error: errorMsg };
    }
  
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials'
        });

        const data = await response.json();

        if (!response.ok) {
            const errorDetails = data.error_description || JSON.stringify(data);
            console.error(`[PayPal Auth Error] Status: ${response.status}, Details: ${errorDetails}`);
            return { error: `Failed to get PayPal access token. Details: ${errorDetails}` };
        }
        
        return { accessToken: data.access_token };
    } catch (e: any) {
        console.error("[PayPal Auth] Network/System Error:", e);
        return { error: `A network or system error occurred while trying to authenticate with PayPal: ${e.message}` };
    }
}


export async function createPayPalOrder(payload: CreateOrderPayload): Promise<{orderID?: string, error?: string}> {
    const { orderType, value } = payload;
    let purchaseAmount = '0.01'; 

    if (orderType === 'tokens') {
        purchaseAmount = (value * 0.01).toFixed(2);
    } else if (orderType === 'donation') {
        purchaseAmount = value.toFixed(2);
    }

    if (parseFloat(purchaseAmount) <= 0) {
        return { error: 'Invalid purchase amount.' };
    }
    
    const PAYPAL_API_BASE_URL = process.env.NODE_ENV === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    try {
        const tokenResult = await getAccessToken();

        if (tokenResult.error || !tokenResult.accessToken) {
            return { error: tokenResult.error || 'Unknown authentication error.' };
        }
        
        const accessToken = tokenResult.accessToken;
        const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders`;

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
             const errorDetails = orderData.message || JSON.stringify(orderData);
             console.error(`[PayPal Order Error] Status: ${response.status}, Details: ${errorDetails}`);
             return { error: `Failed to create PayPal order. Details: ${errorDetails}` };
        }

    } catch (error: any) {
        console.error("[PayPal Order] Action failed:", error);
        return { error: error.message || 'Failed to create PayPal order on the server.' };
    }
}


export async function capturePayPalOrder(orderID: string, userId: string): Promise<{success: boolean, message: string}> {
    const PAYPAL_API_BASE_URL = process.env.NODE_ENV === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    try {
        const tokenResult = await getAccessToken();
        
        if (tokenResult.error || !tokenResult.accessToken) {
            throw new Error(tokenResult.error || 'Failed to authenticate for payment capture.');
        }
        
        const accessToken = tokenResult.accessToken;
        const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders/${orderID}/capture`;

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
            
            const tokensEarned = Math.round(amountPaid * 100);

            const settings = await getAppSettingsAction();
            let bonusTokens = 0;
            if (amountPaid === 10.00) bonusTokens = settings.referralBonus || 0;
            if (amountPaid >= 25.00) bonusTokens = 500;
            
            const totalTokens = tokensEarned + bonusTokens;
            
            const userRef = db.collection('users').doc(userId);
            const batch = db.batch();

            batch.update(userRef, { tokenBalance: FieldValue.increment(totalTokens) });

            const tokenLogRef = userRef.collection('transactionLogs').doc();
            batch.set(tokenLogRef, {
                actionType: 'purchase',
                tokenChange: totalTokens,
                timestamp: FieldValue.serverTimestamp(),
                description: `Purchased ${tokensEarned} tokens (+${bonusTokens} bonus) via PayPal.`,
            });
            
            const paymentHistoryRef = userRef.collection('paymentHistory').doc(orderID);
            batch.set(paymentHistoryRef, {
                orderId: orderID,
                amount: amountPaid,
                currency: currency,
                status: 'COMPLETED',
                tokensPurchased: tokensEarned,
                createdAt: FieldValue.serverTimestamp(),
            });
            
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


export async function capturePayPalDonation(orderID: string, userId: string, amount: number): Promise<{success: boolean, message: string}> {
    const PAYPAL_API_BASE_URL = process.env.NODE_ENV === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    try {
        const tokenResult = await getAccessToken();
        if (tokenResult.error || !tokenResult.accessToken) {
            throw new Error(tokenResult.error || 'Failed to authenticate for donation capture.');
        }

        const accessToken = tokenResult.accessToken;
        const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders/${orderID}/capture`;

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

            const paymentHistoryRef = userRef.collection('paymentHistory').doc(orderID);
            batch.set(paymentHistoryRef, {
                orderId: orderID,
                amount: amountPaid,
                currency: currency,
                status: 'COMPLETED',
                tokensPurchased: 0,
                createdAt: FieldValue.serverTimestamp(),
            });
            
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

    