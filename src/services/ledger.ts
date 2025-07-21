
"use server";

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup } from 'firebase/firestore';
// Use the ADMIN SDK for server-side operations with full privileges
import { db } from '@/lib/firebase-admin'; 

export interface FinancialLedgerEntry {
  id?: string;
  type: 'revenue' | 'expense';
  description: string;
  amount: number;
  timestamp: Date | Timestamp;
  source?: 'paypal' | 'manual';
  orderId?: string;
  userId?: string;
}

export interface TokenAnalytics {
    purchased: number;
    signupBonus: number;
    referralBonus: number;
    practiceEarn: number;
    translationSpend: number;
    totalAwarded: number;
    netFlow: number;
}


/**
 * Fetches all entries from the financial ledger, ordered by date.
 * Relies on the Admin SDK to bypass security rules.
 */
export async function getFinancialLedger(): Promise<FinancialLedgerEntry[]> {
    if (!db) {
        console.error("getFinancialLedger: Firestore admin instance is not available.");
        return [];
    }
    const ledgerCol = collection(db, 'financialLedger');
    const q = query(ledgerCol, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate() // Convert Firestore Timestamp to JS Date
    })) as FinancialLedgerEntry[];
}

/**
 * Calculates analytics from the ledger.
 */
export async function getLedgerAnalytics(): Promise<{ revenue: number, expenses: number, net: number }> {
    const entries = await getFinancialLedger();
    let revenue = 0;
    let expenses = 0;

    for (const entry of entries) {
        if (entry.type === 'revenue') {
            revenue += entry.amount;
        } else if (entry.type === 'expense') {
            expenses += entry.amount;
        }
    }

    return { revenue, expenses, net: revenue - expenses };
}


/**
 * Adds a new entry to the financial ledger.
 * This is intended for admin use (e.g., adding an expense).
 */
export async function addLedgerEntry(entry: Omit<FinancialLedgerEntry, 'id'>) {
    if (!db) {
        throw new Error("addLedgerEntry: Firestore admin instance is not available.");
    }
    const ledgerCol = collection(db, 'financialLedger');
    await addDoc(ledgerCol, { ...entry, timestamp: Timestamp.fromDate(entry.timestamp as Date) });
}

/**
 * Fetches and calculates token analytics using a collectionGroup query.
 * Requires Admin SDK to bypass security rules.
 */
export async function getTokenAnalytics(): Promise<TokenAnalytics> {
    const analytics: TokenAnalytics = {
        purchased: 0,
        signupBonus: 0,
        referralBonus: 0,
        practiceEarn: 0,
        translationSpend: 0,
        totalAwarded: 0,
        netFlow: 0
    };
    
    if (!db) {
        console.error("getTokenAnalytics: Firestore admin instance is not available.");
        return analytics;
    }

    const logsQuery = collectionGroup(db, 'transactionLogs');
    const logsSnapshot = await getDocs(logsQuery);

    logsSnapshot.forEach(doc => {
        const log = doc.data();
        switch(log.actionType) {
            case 'purchase':
                analytics.purchased += log.tokenChange;
                break;
            case 'signup_bonus':
                analytics.signupBonus += log.tokenChange;
                break;
            case 'referral_bonus':
                analytics.referralBonus += log.tokenChange;
                break;
            case 'practice_earn':
                analytics.practiceEarn += log.tokenChange;
                break;
            case 'translation_spend':
                analytics.translationSpend += Math.abs(log.tokenChange); // Spends are negative
                break;
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn;
    analytics.netFlow = analytics.purchased - analytics.totalAwarded;

    return analytics;
}
