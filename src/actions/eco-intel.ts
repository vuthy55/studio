
'use server';
/**
 * @fileOverview A server action to securely expose the eco-footprint calculation flow.
 */
import { calculateEcoFootprint } from '@/ai/flows/calculate-eco-footprint-flow';
import type { EcoFootprintInput, EcoFootprintOutput } from '@/ai/flows/types';
import { getAppSettingsAction } from './settings';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CountryEcoIntel, ClientEcoFootprint } from '@/lib/types';


/**
 * Server action wrapper for the calculateEcoFootprint Genkit flow.
 * This function also handles the token deduction for the service.
 * It has been refactored to ensure that even if the AI flow fails,
 * a debug log is returned to the client.
 * @param input The user's travel description and destination country.
 * @param userId The ID of the user requesting the calculation.
 * @returns A promise that resolves to the structured eco-footprint data and a debug log.
 */
export async function calculateEcoFootprintAction(input: EcoFootprintInput, userId: string): Promise<{ result?: EcoFootprintOutput; debugLog: string[]; error?: string; }> {
    const debugLog: string[] = [];

    if (!userId) {
        const errorMsg = "User ID is required to calculate eco-footprint.";
        debugLog.push(`[FAIL] ${errorMsg}`);
        return { error: errorMsg, debugLog };
    }
    
    debugLog.push(`[INFO] Starting eco-footprint calculation for user: ${userId}`);
    const settings = await getAppSettingsAction();
    const cost = settings.ecoFootprintCost || 10;
    debugLog.push(`[INFO] Token cost for this action: ${cost}`);
    
    const userRef = db.collection('users').doc(userId);
    
    try {
        // Step 1: Run the transaction for token deduction first.
        await db.runTransaction(async (transaction) => {
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
            
            // Deduct tokens and log the transaction
            transaction.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
            const logRef = userRef.collection('transactionLogs').doc();
            transaction.set(logRef, {
                actionType: 'eco_footprint_spend',
                tokenChange: -cost,
                timestamp: FieldValue.serverTimestamp(),
                description: 'Eco-Footprint Calculation',
            });
            debugLog.push(`[SUCCESS] Token deduction and transaction log added to batch.`);
        });
        debugLog.push(`[SUCCESS] Token deduction transaction completed successfully.`);

        // Step 2: Run the AI flow AFTER the transaction has succeeded.
        debugLog.push(`[INFO] Executing calculateEcoFootprintFlow...`);
        const flowResult = await calculateEcoFootprint(input);
        
        debugLog.push('[SUCCESS] AI analysis complete. Returning structured output.');
        return { result: flowResult, debugLog };

    } catch (error: any) {
        console.error("Critical error in calculateEcoFootprintAction:", error);
        debugLog.push(`[CRITICAL] Server action failed: ${error.message}`);
        // Return the debug log along with the error message.
        return { error: error.message, debugLog };
    }
}


/**
 * Fetches the eco-intel data for a single country by its unique country code.
 * This is a client-callable server action.
 * @param countryCode The ISO 3166-1 alpha-2 code of the country (e.g., "MY").
 * @returns {Promise<CountryEcoIntel | null>}
 */
export async function getCountryEcoIntel(countryCode: string): Promise<CountryEcoIntel | null> {
    try {
        if (!countryCode) return null;
        
        const intelDocRef = db.collection('countryEcoIntel').doc(countryCode);
        const doc = await intelDocRef.get();

        if (!doc.exists) {
            return null;
        }
        
        const data = doc.data();
        if (!data) return null;
        
        const lastBuildAt = (data.lastBuildAt as Timestamp)?.toDate().toISOString();

        return {
            id: doc.id,
            ...data,
            lastBuildAt,
        } as CountryEcoIntel;

    } catch (error) {
        console.error(`Error fetching eco-intel data for ${countryCode}:`, error);
        return null;
    }
}


/**
 * Saves a calculated eco-footprint to the user's subcollection in Firestore.
 */
export async function saveEcoFootprintAction(
  userId: string,
  payload: {
    journeySummary: string;
    countryName: string;
    co2Kilograms: number;
    localOpportunities: EcoFootprintOutput['localOpportunities'];
  }
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !payload) {
    return { success: false, error: 'User ID and payload are required.' };
  }
  try {
    const footprintRef = db.collection('users').doc(userId).collection('ecoFootprints').doc();
    await footprintRef.set({
      ...payload,
      userId: userId,
      createdAt: FieldValue.serverTimestamp(),
      offsetActions: ''
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error saving eco-footprint:', error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}

/**
 * Fetches all saved eco-footprints for a given user.
 */
export async function getSavedEcoFootprintsAction(userId: string): Promise<ClientEcoFootprint[]> {
  if (!userId) return [];
  try {
    const footprintsRef = db.collection('users').doc(userId).collection('ecoFootprints').orderBy('createdAt', 'desc');
    const snapshot = await footprintsRef.get();
    if (snapshot.empty) return [];

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
      } as ClientEcoFootprint;
    });
  } catch (error) {
    console.error('Error fetching saved eco-footprints:', error);
    return [];
  }
}

/**
 * Updates the 'offsetActions' for a specific saved footprint.
 */
export async function updateEcoFootprintOffsetAction(
  userId: string,
  footprintId: string,
  offsetActions: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !footprintId) {
    return { success: false, error: 'User ID and Footprint ID are required.' };
  }
  try {
    const footprintRef = db.collection('users').doc(userId).collection('ecoFootprints').doc(footprintId);
    await footprintRef.update({ offsetActions });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating offset actions:', error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}

/**
 * Deletes a specific eco-footprint from a user's history.
 */
export async function deleteEcoFootprintAction(
  userId: string,
  footprintId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !footprintId) {
    return { success: false, error: 'User ID and Footprint ID are required.' };
  }
  try {
    const footprintRef = db.collection('users').doc(userId).collection('ecoFootprints').doc(footprintId);
    await footprintRef.delete();
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting eco-footprint:', error);
    return { success: false, error: 'An unexpected server error occurred while deleting the footprint.' };
  }
}


/**
 * Deletes a single eco-tourism opportunity from a saved footprint.
 */
export async function deleteEcoTourismOpportunityAction(
  userId: string,
  footprintId: string,
  opportunityToRemove: EcoFootprintOutput['localOpportunities'][0]
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !footprintId || !opportunityToRemove) {
    return { success: false, error: 'Missing required IDs.' };
  }
  try {
    const footprintRef = db.collection('users').doc(userId).collection('ecoFootprints').doc(footprintId);
    await footprintRef.update({
      localOpportunities: FieldValue.arrayRemove(opportunityToRemove)
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting eco-tourism opportunity:', error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}
