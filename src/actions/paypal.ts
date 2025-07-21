'use server';

import paypal from '@paypal/checkout-server-sdk';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';


// --- PayPal Client Setup ---
function getPayPalClient() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal client ID or secret is not configured.');
  }

  // Use LiveEnvironment for production, Sandbox for anything else
  const environment =
    process.env.NODE_ENV === 'production'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);

  return new paypal.core.PayPalHttpClient(environment);
}

// --- Server Action: Create an order ---
export async function createPayPalOrder(userId: string, tokenAmount: number): Promise<{orderID?: string, error?: string}> {
  if (!userId || !tokenAmount) {
    return { error: 'User ID and token amount are required' };
  }
  if (tokenAmount <= 0) {
    return { error: 'Token amount must be positive' };
  }

  const value = (tokenAmount * 0.01).toFixed(2); // 1 token = $0.01 USD

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: value,
        },
        // We will no longer use custom_id as it's unreliable.
        // We will store metadata in Firestore instead.
      },
    ],
  });

  try {
    const order = await getPayPalClient().execute(request);
    const orderID = order.result.id;

    // --- Create a temporary order document in Firestore ---
    const tempOrderRef = db.collection('paypalOrders').doc(orderID);
    await tempOrderRef.set({
      userId,
      tokenAmount,
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

    // --- At this point, PayPal payment is confirmed. Now, grant tokens. ---
    
    // --- Retrieve order metadata from our temporary Firestore doc ---
    const tempOrderRef = db.collection('paypalOrders').doc(orderID);
    const tempOrderDoc = await tempOrderRef.get();

    if (!tempOrderDoc.exists) {
        throw new Error(`Critical: Could not find order metadata for orderID ${orderID}. Cannot grant tokens.`);
    }
    const { userId, tokenAmount } = tempOrderDoc.data()!;


    const purchaseUnit = captureResult.purchase_units[0];
    const amount = parseFloat(purchaseUnit.payments.captures[0].amount.value);
    const currency = purchaseUnit.payments.captures[0].amount.currency_code;
    
    // Use a Firestore transaction to ensure atomicity
    const userRef = db.collection('users').doc(userId);
    
    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new Error(`User with ID ${userId} not found in Firestore.`);
        }
        
        // 1. Update user's token balance
        transaction.update(userRef, {
            tokenBalance: FieldValue.increment(tokenAmount)
        });

        // 2. Create payment history log for user
        const paymentLogRef = userRef.collection('paymentHistory').doc(orderID);
        transaction.set(paymentLogRef, {
            orderId: orderID,
            amount: amount,
            currency: currency,
            status: 'COMPLETED',
            tokensPurchased: tokenAmount,
            createdAt: FieldValue.serverTimestamp()
        });

        // 3. Create general transaction log for user
         const transactionLogRef = userRef.collection('transactionLogs').doc(); // Auto-generate ID
         transaction.set(transactionLogRef, {
            actionType: 'purchase',
            tokenChange: tokenAmount,
            timestamp: FieldValue.serverTimestamp(),
            description: `Purchased ${tokenAmount} tokens via PayPal`
        });

        // 4. Create master financial ledger entry
        const financialLedgerRef = db.collection('financialLedger').doc(`paypal-${orderID}`);
        transaction.set(financialLedgerRef, {
          type: 'revenue',
          description: `Token Purchase by User ID: ${userId}`,
          amount: amount,
          timestamp: FieldValue.serverTimestamp(),
          source: 'paypal',
          orderId: orderID,
          userId: userId
        });

        // 5. Delete the temporary order doc
        transaction.delete(tempOrderRef);
    });

    return { success: true, message: 'Payment successful and tokens have been added to your account!' };

  } catch (err: any) {
     console.error("Error during PayPal capture or Firestore update:", err);
     const errorDetails = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
     return { success: false, message: `An unexpected server error occurred. Details: ${errorDetails}`};
  }
}
