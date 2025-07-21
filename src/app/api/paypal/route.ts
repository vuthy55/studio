
import { NextRequest, NextResponse } from 'next/server';
import paypal from '@paypal/checkout-server-sdk';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// --- PayPal Client Setup ---
function getPayPalClient() {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("PayPal client ID or secret is not configured in .env.local");
    }

    // Use LiveEnvironment for production, Sandbox for anything else
    const environment = process.env.NODE_ENV === 'production'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);
        
    return new paypal.core.PayPalHttpClient(environment);
}


// --- API Handler: POST for creating an order ---
export async function POST(req: NextRequest) {
    const { userId, tokenAmount } = await req.json();

    if (!userId || !tokenAmount) {
        return NextResponse.json({ error: 'User ID and token amount are required' }, { status: 400 });
    }
    if (tokenAmount <= 0) {
        return NextResponse.json({ error: 'Token amount must be positive' }, { status: 400 });
    }

    const value = (tokenAmount * 0.01).toFixed(2); // 1 token = $0.01 USD

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'USD',
                value: value,
            },
            custom_id: JSON.stringify({ userId, tokenAmount }), // Store our metadata
        }],
    });

    try {
        const order = await getPayPalClient().execute(request);
        return NextResponse.json({ orderID: order.result.id });
    } catch (err: any) {
        // More detailed server-side logging
        console.error("Error creating PayPal order:", err);
        const errorDetails = err.data ? JSON.stringify(err.data) : err.message || "An unknown error occurred.";
        return NextResponse.json({ error: `Failed to create PayPal order: ${errorDetails}` }, { status: 500 });
    }
}


// --- API Handler: PUT for capturing an order ---
export async function PUT(req: NextRequest) {
    const { orderID } = await req.json();

    if (!orderID) {
        return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    try {
        const capture = await getPayPalClient().execute(request);
        const captureResult = capture.result;
        
        // Log the successful capture from PayPal before attempting database operations
        console.log("PayPal capture successful:", JSON.stringify(captureResult, null, 2));


        if (captureResult.status === 'COMPLETED') {
            const purchaseUnit = captureResult.purchase_units[0];
            const { userId, tokenAmount } = JSON.parse(purchaseUnit.custom_id);
            const amount = parseFloat(purchaseUnit.amount.value);
            const currency = purchaseUnit.amount.currency_code;
            
            // --- FIREBASE CODE TEMPORARILY DISABLED FOR DEBUGGING ---
            // This section will be re-enabled and moved to a separate API route once the root cause is fixed.
            
            // const userRef = db.collection('users').doc(userId);
            
            // await db.runTransaction(async (transaction) => {
            //     const userDoc = await transaction.get(userRef);
            //     if (!userDoc.exists) {
            //         throw new Error("User not found!");
            //     }
                
            //     // 1. Update user's token balance
            //     transaction.update(userRef, {
            //         tokenBalance: FieldValue.increment(tokenAmount)
            //     });

            //     // 2. Create payment history log
            //     const paymentLogRef = userRef.collection('paymentHistory').doc(orderID);
            //     transaction.set(paymentLogRef, {
            //         orderId: orderID,
            //         amount: amount,
            //         currency: currency,
            //         status: 'COMPLETED',
            //         tokensPurchased: tokenAmount,
            //         createdAt: FieldValue.serverTimestamp()
            //     });

            //     // 3. Create general transaction log
            //      const transactionLogRef = userRef.collection('transactionLogs').doc();
            //      transaction.set(transactionLogRef, {
            //         actionType: 'purchase',
            //         tokenChange: tokenAmount,
            //         timestamp: FieldValue.serverTimestamp(),
            //         description: `Purchased ${tokenAmount} tokens`
            //     });

            //     // 4. Create financial ledger entry for revenue
            //     const ledgerRef = db.collection('financialLedger').doc();
            //     transaction.set(ledgerRef, {
            //         type: 'revenue',
            //         description: `Token Purchase by ${userDoc.data()?.email || userId}`,
            //         amount: amount,
            //         timestamp: FieldValue.serverTimestamp(),
            //         source: 'paypal',
            //         orderId: orderID,
            //         userId: userId,
            //     });
            // });

            return NextResponse.json({ success: true, message: 'DEBUG: Payment completed with PayPal. Firebase update is currently disabled.' });
        } else {
            return NextResponse.json({ error: `Payment not completed. Status: ${captureResult.status}` }, { status: 400 });
        }
    } catch (err: any) {
        // More detailed server-side logging and pass the error message to the client
        console.error("Error capturing PayPal order or writing to Firestore:", err);
        // Ensure a valid string is always sent back
        const errorDetails = err.data ? JSON.stringify(err.data) : (err.message || "An unknown server error occurred.");
        return NextResponse.json({ error: `Failed to capture PayPal order: ${errorDetails}` }, { status: 500 });
    }
}
