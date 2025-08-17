
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
 * @returns A promise that resolves to the structured eco-footprint data.
 */
export async function calculateEcoFootprintAction(input: EcoFootprintInput, userId: string): Promise<EcoFootprintOutput> {
    if (!userId) {
        throw new Error("User ID is required to calculate eco-footprint.");
    }
    
    const settings = await getAppSettingsAction();
    const cost = settings.ecoFootprintCost || 10;
    
    const userRef = db.collection('users').doc(userId);
    
    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new Error("User not found.");
        }
        
        const currentBalance = userDoc.data()?.tokenBalance || 0;
        if (currentBalance < cost) {
            throw new Error(`Insufficient tokens. You need ${cost} tokens for this calculation.`);
        }
        
        // 1. Deduct tokens and log the transaction
        transaction.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
        const logRef = userRef.collection('transactionLogs').doc();
        transaction.set(logRef, {
            actionType: 'transport_intel', // Reusing for now, can be changed
            tokenChange: -cost,
            timestamp: FieldValue.serverTimestamp(),
            description: 'Eco-Footprint Calculation',
        });
        
        // 2. Run the AI flow (after transaction setup)
        const result = await calculateEcoFootprint(input);
        return result;
    });
}
