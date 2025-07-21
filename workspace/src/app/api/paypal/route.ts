
import { NextRequest, NextResponse } from 'next/server';
import paypal from '@paypal/checkout-server-sdk';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// --- PayPal Client Setup ---
function getPayPalClient() {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("PayPal client ID or secret is not configured.");
    }

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
        console.error("Error creating PayPal order:", err.message);
        return NextResponse.json({ error: 'Failed to create PayPal order' }, { status: 500 });
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

        if (captureResult.status === 'COMPLETED') {
            const purchaseUnit = captureResult.purchase_units[0];
            const { userId, tokenAmount } = JSON.parse(purchaseUnit.custom_id);
            const amount = purchaseUnit.amount.value;
            const currency = purchaseUnit.amount.currency_code;
            
            // Use a Firestore transaction to ensure atomicity
            const userRef = db.collection('users').doc(userId);
            
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error("User not found!");
                }
                
                // 1. Update user's token balance
                transaction.update(userRef, {
                    tokenBalance: FieldValue.increment(tokenAmount)
                });

                // 2. Create payment history log
                const paymentLogRef = userRef.collection('paymentHistory').doc(orderID);
                transaction.set(paymentLogRef, {
                    orderId: orderID,
                    amount: parseFloat(amount),
                    currency: currency,
                    status: 'COMPLETED',
                    tokensPurchased: tokenAmount,
                    createdAt: FieldValue.serverTimestamp()
                });

                // 3. Create general transaction log
                 const transactionLogRef = userRef.collection('transactionLogs').doc();
                 transaction.set(transactionLogRef, {
                    actionType: 'purchase',
                    tokenChange: tokenAmount,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Purchased ${tokenAmount} tokens`
                });
            });

            return NextResponse.json({ success: true, message: 'Payment completed and tokens added.' });
        } else {
            return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
        }
    } catch (err: any) {
        console.error("Error capturing PayPal order:", err.message);
        return NextResponse.json({ error: 'Failed to capture PayPal order' }, { status: 500 });
    }
}
