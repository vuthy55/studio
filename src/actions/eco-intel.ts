
'use server';
/**
 * @fileOverview A server action to securely expose the eco-footprint calculation flow.
 */
import { calculateEcoFootprint } from '@/ai/flows/calculate-eco-footprint-flow';
import type { EcoFootprintInput, EcoFootprintOutput } from '@/ai/flows/types';
import { getAppSettingsAction } from './settings';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';


/**
 * Server action wrapper for the calculateEcoFootprint Genkit flow.
 * This function also handles the token deduction for the service.
 * @param input The user's travel description.
 * @param userId The ID of the user requesting the calculation.
 * @returns A promise that resolves to the structured eco-footprint data and a debug log.
 */
export async function calculateEcoFootprintAction(input: EcoFootprintInput, userId: string): Promise<{ result: EcoFootprintOutput; debugLog: string[] }> {
    const debugLog: string[] = [];

    if (!userId) {
        debugLog.push('[FAIL] User ID not provided.');
        throw new Error("User ID is required to calculate eco-footprint.");
    }
    
    debugLog.push(`[INFO] Starting eco-footprint calculation for user: ${userId}`);
    const settings = await getAppSettingsAction();
    const cost = settings.ecoFootprintCost || 10;
    debugLog.push(`[INFO] Token cost for this action: ${cost}`);
    
    const userRef = db.collection('users').doc(userId);
    
    try {
        const result = await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                debugLog.push(`[FAIL] User with ID ${userId} not found in Firestore.`);
                throw new Error("User not found.");
            }
            
            const currentBalance = userDoc.data()?.tokenBalance || 0;
            debugLog.push(`[INFO] User's current balance: ${currentBalance} tokens.`);
            if (currentBalance < cost) {
                debugLog.push(`[FAIL] Insufficient balance. Needs ${cost}, has ${currentBalance}.`);
                throw new Error(`Insufficient tokens. You need ${cost} tokens for this calculation.`);
            }
            
            // 1. Deduct tokens and log the transaction
            transaction.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
            const logRef = userRef.collection('transactionLogs').doc();
            transaction.set(logRef, {
                actionType: 'transport_intel',
                tokenChange: -cost,
                timestamp: FieldValue.serverTimestamp(),
                description: 'Eco-Footprint Calculation',
            });
            debugLog.push(`[SUCCESS] Token deduction and transaction log added to batch.`);
            
            // 2. Run the AI flow (after transaction setup)
            debugLog.push(`[INFO] Executing calculateEcoFootprintFlow...`);
            const flowResult = await calculateEcoFootprint(input, debugLog);
            return flowResult;
        });

        debugLog.push(`[SUCCESS] Flow execution completed successfully.`);
        return { result, debugLog };
    } catch (error: any) {
        console.error("Critical error in calculateEcoFootprintAction:", error);
        debugLog.push(`[CRITICAL] Server action failed: ${error.message}`);
        // To ensure the client gets the debug log even on failure, we re-throw but the log is captured.
        // In a real scenario, we might want to return a specific error structure.
        // For now, we'll just throw so the client knows it failed but we can still see the log.
        throw error;
    }
}
