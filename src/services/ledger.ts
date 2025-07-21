
'use client';

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup, where, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import type { TransactionLog } from '@/lib/types';


export interface FinancialLedgerEntry {
  id?: string;
  type: 'revenue' | 'expense';
  description: string;
  amount: number;
  timestamp: Date | Timestamp;
  source?: 'paypal' | 'manual';
  orderId?: string;
  userId?: string;
  link?: string;
}

export interface TokenAnalytics {
    purchased: number;
    signupBonus: number;
    referralBonus: number;
    practiceEarn: number;
    translationSpend: number;
    totalAwarded: number;
    totalTokensInSystem: number;
}

export interface TokenLedgerEntry extends TransactionLog {
  id: string;
  userId: string;
  userEmail: string;
  timestamp: Date;
}


/**
 * Fetches all entries from the financial ledger, ordered by date.
 */
export async function getFinancialLedger(): Promise<FinancialLedgerEntry[]> {
    const ledgerCol = collection(db, 'financialLedger');
    const q = query(ledgerCol, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: (doc.data().timestamp as Timestamp).toDate()
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
 * Adds a new entry to the financial ledger. This should only be called from a secure environment.
 */
export async function addLedgerEntry(entry: Omit<FinancialLedgerEntry, 'id'>) {
    const ledgerCol = collection(db, 'financialLedger');
    const entryData: any = { ...entry, timestamp: Timestamp.fromDate(entry.timestamp as Date) };

    // Ensure link is not undefined
    if (entry.link === undefined) {
        delete entryData.link;
    }
    
    await addDoc(ledgerCol, entryData);
}

/**
 * Finds a user by their email address.
 * @returns {Promise<{id: string, email: string} | null>} The user object or null if not found.
 */
export async function findUserByEmail(email: string): Promise<{id: string, email: string} | null> {
    if (!email) return null;
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, email: userDoc.data().email };
}

/**
 * Fetches and calculates token analytics using a collectionGroup query.
 */
export async function getTokenAnalytics(): Promise<TokenAnalytics> {
    const analytics: TokenAnalytics = {
        purchased: 0,
        signupBonus: 0,
        referralBonus: 0,
        practiceEarn: 0,
        translationSpend: 0,
        totalAwarded: 0,
        totalTokensInSystem: 0,
    };
    
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
                analytics.translationSpend += Math.abs(log.tokenChange);
                break;
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn;
    analytics.totalTokensInSystem = analytics.purchased + analytics.totalAwarded;

    return analytics;
}


/**
 * Fetches all token transaction logs across all users.
 */
export async function getTokenLedger(): Promise<TokenLedgerEntry[]> {
    const logsQuery = collectionGroup(db, 'transactionLogs');
    const orderedQuery = query(logsQuery, orderBy('timestamp', 'desc'));
    const logsSnapshot = await getDocs(orderedQuery);

    const ledgerEntries: TokenLedgerEntry[] = [];
    const userCache: Record<string, string> = {};

    for (const logDoc of logsSnapshot.docs) {
        const logData = logDoc.data() as TransactionLog;
        const userRef = logDoc.ref.parent.parent; // Gets the user document reference
        
        if (userRef) {
            let userEmail = userCache[userRef.id];
            if (!userEmail) {
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    userEmail = userDoc.data().email || 'Unknown';
                    userCache[userRef.id] = userEmail;
                } else {
                    userEmail = 'Deleted User';
                }
            }

            ledgerEntries.push({
                ...logData,
                id: logDoc.id,
                userId: userRef.id,
                userEmail: userEmail,
                timestamp: (logData.timestamp as Timestamp).toDate(),
            });
        }
    }

    return ledgerEntries;
}
