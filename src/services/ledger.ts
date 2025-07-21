

'use client';

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup, where, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import type { TransactionLog } from '@/lib/types';
import type { AppSettings } from './settings';


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

export interface ReferralEntry {
    id: string;
    referrerUid: string;
    referredUid: string;
    status: 'completed' | 'pending';
    bonusAwarded: number;
    createdAt: Date;
    referrerName?: string;
    referrerEmail?: string;
    referredName?: string;
    referredEmail?: string;
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
    
    if (entry.link) {
        entryData.link = entry.link;
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
        if (log.actionType) { // Ensure log has an actionType before processing
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
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn;
    analytics.totalTokensInSystem = analytics.purchased + analytics.totalAwarded;

    return analytics;
}


/**
 * Fetches all token transaction logs across all users by iterating through users.
 * This avoids a complex collectionGroup query that requires a custom index.
 */
export async function getTokenLedger(): Promise<TokenLedgerEntry[]> {
  try {
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    let allLogs: TokenLedgerEntry[] = [];

    // Create an array of promises to fetch logs for all users in parallel
    const logFetchPromises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const userEmail = userDoc.data().email || 'Unknown';
      const logsRef = collection(db, 'users', userId, 'transactionLogs');
      const logsSnapshot = await getDocs(logsRef);
      
      const userLogs: TokenLedgerEntry[] = [];
      logsSnapshot.forEach((logDoc) => {
        const logData = logDoc.data() as TransactionLog;
        userLogs.push({
          ...logData,
          id: logDoc.id,
          userId: userId,
          userEmail: userEmail,
          timestamp: (logData.timestamp as Timestamp).toDate(),
        });
      });
      return userLogs;
    });

    // Wait for all log fetching promises to resolve
    const userLogArrays = await Promise.all(logFetchPromises);
    
    // Flatten the array of arrays into a single array
    allLogs = userLogArrays.flat();
    
    // Sort the combined logs by timestamp in descending order
    allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return allLogs;

  } catch (error) {
    console.error('Error fetching token ledger:', error);
    // Re-throw the error to be caught by the calling component
    throw error;
  }
}

/**
 * Fetches all referral records and enriches them with user data.
 */
export async function getReferralHistory(): Promise<ReferralEntry[]> {
  const referralsRef = collection(db, 'referrals');
  const q = query(referralsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  const referralData = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: (doc.data().createdAt as Timestamp).toDate(),
  })) as ReferralEntry[];

  // Get all unique user IDs
  const userIds = [
    ...new Set(referralData.map(r => r.referrerUid).concat(referralData.map(r => r.referredUid))),
  ];

  if (userIds.length === 0) return [];

  // Fetch all user documents in a single query if possible
  const userDocs = new Map<string, {name: string, email: string}>();
  // Firestore 'in' query supports up to 30 items
  for (let i = 0; i < userIds.length; i += 30) {
      const chunk = userIds.slice(i, i + 30);
      const userQuery = query(collection(db, 'users'), where(document.id, 'in', chunk));
      const userSnapshot = await getDocs(userQuery);
      userSnapshot.forEach(doc => {
        userDocs.set(doc.id, { name: doc.data().name, email: doc.data().email });
      });
  }

  // Enrich referral data
  return referralData.map(referral => {
    const referrer = userDocs.get(referral.referrerUid);
    const referred = userDocs.get(referral.referredUid);
    return {
      ...referral,
      referrerName: referrer?.name || 'Unknown',
      referrerEmail: referrer?.email || 'Unknown',
      referredName: referred?.name || 'Unknown',
      referredEmail: referred?.email || 'Unknown',
    };
  });
}
