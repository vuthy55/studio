
"use server";

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup, where } from 'firebase/firestore';
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
 * Accessible only to admins on the client-side due to Firestore rules.
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
 * Performs a collection group query to analyze token distribution.
 * This requires a specific collection group index and security rule.
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

    const logsQuery = query(collectionGroup(db, 'transactionLogs'));
    const logsSnapshot = await getDocs(logsQuery);
    
    logsSnapshot.forEach(logDoc => {
        const log = logDoc.data();
        const change = Math.abs(log.tokenChange);

        switch (log.actionType) {
            case 'purchase':
                analytics.purchased += change;
                break;
            case 'signup_bonus':
                analytics.signupBonus += change;
                break;
            case 'referral_bonus':
                analytics.referralBonus += change;
                break;
            case 'practice_earn':
                analytics.practiceEarn += change;
                break;
            case 'translation_spend':
                analytics.translationSpend += change;
                break;
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn;
    analytics.netFlow = analytics.purchased - analytics.totalAwarded;

    return analytics;
}
