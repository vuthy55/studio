
'use server';

import paypal from '@paypal/checkout-server-sdk';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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
    throw new Error('PayPal client ID or secret is not configured.');
  }

  // NOTE: Forcing SandboxEnvironment for beta testing.
  // In a full production release, this would be conditional based on process.env.NODE_ENV.
  const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);

  return new paypal.core.PayPalHttpClient(environment);
}

// --- Server Action: Create an order ---
export async function createPayPalOrder(payload: CreateOrderPayload): Promise<{orderID?: string, error?: string}> {
  const { userId, orderType, value } = payload;
  
  if (!userId || !orderType || !value) {
    return { error: 'User ID, order type, and value are required' };
  }
  if (value <= 0) {
    return { error: 'Value must be positive' };
  }

  let purchaseValue: string;
  let orderMetadata: Record<string, any>;

  if (orderType === 'tokens') {
      purchaseValue = (value * 0.01).toFixed(2); // 1 token = $0.01 USD
      orderMetadata = { userId, orderType, tokenAmount: value };
  } else if (orderType === 'donation') {
      purchaseValue = value.toFixed(2);
      orderMetadata = { userId, orderType, donationAmount: value };
  } else {
      return { error: 'Invalid order type specified.' };
  }

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: purchaseValue,
        },
      },
    ],
  });

  try {
    const order = await getPayPalClient().execute(request);
    const orderID = order.result.id;

    // --- Create a temporary order document in Firestore ---
    const tempOrderRef = db.collection('paypalOrders').doc(orderID);
    await tempOrderRef.set({
      ...orderMetadata,
      createdAt: FieldValue.serverTimestamp()
    });
    
    return { orderID };
  } catch (err: any) {
    console.error('Error creating PayPal order:', err);
    const errorDetails = err?.message || 'An unknown error occurred';
    return { error: `Failed to create PayPal order: ${errorDetails}` };
  }
}

// --- Server Action: Capture an order ---
export async function capturePayPalOrder(orderID: string): Promise<{success: boolean, message: string}> {
  if (!orderID) {
    return { success: false, message: 'Order ID is required' };
  }

  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const capture = await getPayPalClient().execute(request);
    const captureResult = capture.result;

    if (captureResult.status !== 'COMPLETED') {
       return { success: false, message: `Payment not completed. Status: ${captureResult.status}` };
    }

    // --- Retrieve order metadata from our temporary Firestore doc ---
    const tempOrderRef = db.collection('paypalOrders').doc(orderID);
    const tempOrderDoc = await tempOrderRef.get();

    if (!tempOrderDoc.exists) {
        throw new Error(`Critical: Could not find order metadata for orderID ${orderID}. Cannot process transaction.`);
    }
    const { userId, orderType, tokenAmount, donationAmount } = tempOrderDoc.data()!;
    
    const purchaseUnit = captureResult.purchase_units[0];
    const amount = parseFloat(purchaseUnit.payments.captures[0].amount.value);
    const currency = purchaseUnit.payments.captures[0].amount.currency_code;
    
    const userRef = db.collection('users').doc(userId);
    
    await db.runTransaction(async (transaction) => {
        const paymentLogRef = userRef.collection('paymentHistory').doc(orderID);

        if (orderType === 'tokens') {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error(`User with ID ${userId} not found in Firestore.`);
            
            // 1. Update user's token balance
            transaction.update(userRef, { tokenBalance: FieldValue.increment(tokenAmount) });

            // 2. Create payment history log for user
            transaction.set(paymentLogRef, {
                orderId: orderID, amount, currency, status: 'COMPLETED', tokensPurchased: tokenAmount,
                createdAt: FieldValue.serverTimestamp()
            });

            // 3. Create general transaction log for user
            const transactionLogRef = userRef.collection('transactionLogs').doc();
            transaction.set(transactionLogRef, {
                actionType: 'purchase', tokenChange: tokenAmount, timestamp: FieldValue.serverTimestamp(),
                description: `Purchased ${tokenAmount} tokens via PayPal`
            });
        } else if (orderType === 'donation') {
            // Create payment history log for user for donation
            transaction.set(paymentLogRef, {
                orderId: orderID, amount, currency, status: 'COMPLETED', tokensPurchased: 0, // No tokens for donations
                createdAt: FieldValue.serverTimestamp()
            });
        }
        
        // This part runs for both tokens and donations
        const financialLedgerRef = db.collection('financialLedger').doc(`paypal-${orderID}`);
        transaction.set(financialLedgerRef, {
          type: 'revenue',
          description: orderType === 'tokens' 
              ? `Token Purchase by User ID: ${userId}` 
              : `Donation by User ID: ${userId}`,
          amount,
          timestamp: FieldValue.serverTimestamp(),
          source: orderType === 'tokens' ? 'paypal' : 'paypal-donation',
          orderId: orderID,
          userId: userId
        });

        // Delete the temporary order doc
        transaction.delete(tempOrderRef);
    });

    const successMessage = orderType === 'tokens'
        ? 'Payment successful and tokens have been added to your account!'
        : 'Thank you for your generous donation!';

    return { success: true, message: successMessage };

  } catch (err: any) {
     console.error("Error during PayPal capture or Firestore update:", err);
     const errorDetails = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
     return { success: false, message: `An unexpected server error occurred. Details: ${errorDetails}`};
  }
}
