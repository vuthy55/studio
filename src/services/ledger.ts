
"use server";

import { collection, getDocs, addDoc, query, orderBy, Timestamp } from 'firebase/firestore';
// Use the CLIENT-SIDE SDK and rely on Firestore rules.
import { db } from '@/lib/firebase'; 

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
 * Relies on Firestore rules to allow admins to read this collection.
 */
export async function getFinancialLedger(): Promise<FinancialLedgerEntry[]> {
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
    const ledgerCol = collection(db, 'financialLedger');
    await addDoc(ledgerCol, { ...entry, timestamp: Timestamp.fromDate(entry.timestamp as Date) });
}

/**
 * Temporarily returns zeroed data to prevent permission errors.
 * Fetching all transaction logs from the client is complex and requires further setup.
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

    // The query to get all transaction logs across all users is being blocked by security rules.
    // Returning zeroed data for now to prevent the app from crashing.
    console.warn("getTokenAnalytics is returning mock data to avoid permission errors.");

    return analytics;
}
