'use server';

import paypal from '@paypal/checkout-server-sdk';

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
        custom_id: JSON.stringify({ userId, tokenAmount }), // Store our metadata
      },
    ],
  });

  try {
    const order = await getPayPalClient().execute(request);
    return { orderID: order.result.id };
  } catch (err: any) {
    console.error('Error creating PayPal order:', err);
    const errorMessage = err.message || "An unknown error occurred while creating the order.";
    return { error: `Failed to create PayPal order: ${errorMessage}` };
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

    console.log('PayPal capture successful:', JSON.stringify(captureResult, null, 2));

    if (captureResult.status === 'COMPLETED') {
      const purchaseUnit = captureResult.purchase_units[0];
      const { userId, tokenAmount } = JSON.parse(purchaseUnit.custom_id);
      const amount = parseFloat(purchaseUnit.amount.value);
      const currency = purchaseUnit.amount.currency_code;

      // TODO: In the next step, re-enable Firebase logic here.
      // For now, we just confirm the PayPal part works.
      
      console.log(`SUCCESS: Payment for ${tokenAmount} tokens by user ${userId} captured. Amount: ${amount} ${currency}.`);

      return { success: true, message: 'DEBUG: Payment completed with PayPal. Token grant is disabled for this test.' };
    } else {
      return { success: false, message: `Payment not completed. Status: ${captureResult.status}` };
    }
  } catch (err: any) {
     console.error("Error capturing PayPal order or writing to Firestore:", err);
     // This part is changed to safely handle various error shapes from the PayPal SDK
     let errorDetails = "An unknown server error occurred.";
     if (err.message) {
        errorDetails = err.message;
     } else if (err.data) {
        errorDetails = JSON.stringify(err.data);
     }
     return { success: false, message: `Failed to capture PayPal order: ${errorDetails}`};
  }
}
