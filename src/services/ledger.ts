

'use client';

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup, where, limit, getDoc, doc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import type { TransactionLog } from '@/lib/types';


export interface FinancialLedgerEntry {
  id?: string;
  type: 'revenue' | 'expense';
  description: string;
  amount: number;
  timestamp: Date; // Ensure this is always a Date object for client-side consistency
  source?: 'paypal' | 'manual' | 'paypal-donation';
  orderId?: string;
  userId?: string;
  link?: string;
}

export interface TokenAnalytics {
    purchased: number;
    signupBonus: number;
    referralBonus: number;
    practiceEarn: number;
    adminIssued: number;
    translationSpend: number;
    liveSyncSpend: number;
    liveSyncOnlineSpend: number;
    languagePackDownload: number;
    totalAwarded: number;
    totalSpent: number;
    totalTokensInSystem: number;
    p2pTotalVolume: number;
}

export interface TokenLedgerEntry extends TransactionLog {
  id: string;
  userId: string;
  userEmail: string;
  timestamp: Date;
}

export interface IssueTokensPayload {
    email: string;
    amount: number;
    reason: string;
    description: string;
    adminUser: {
      uid: string;
      email: string;
    }
}

export interface TransferTokensPayload {
    fromUserId: string;
    fromUserEmail: string;
    toUserEmail: string;
    amount: number;
    description: string;
}


/**
 * Fetches entries from the financial ledger, with optional filtering.
 */
export async function getFinancialLedger(emailFilter: string = ''): Promise<FinancialLedgerEntry[]> {
    const ledgerCol = collection(db, 'financialLedger');
    let finalQuery;

    if (emailFilter && emailFilter !== '*') {
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('email', '==', emailFilter.toLowerCase()));
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.empty) {
            return []; // No user found, so no ledger entries
        }
        const userId = userSnapshot.docs[0].id;
        finalQuery = query(ledgerCol, where('userId', '==', userId), orderBy('timestamp', 'desc'));

    } else { // Handles empty string and '*'
        finalQuery = query(ledgerCol, orderBy('timestamp', 'desc'));
    }

    const snapshot = await getDocs(finalQuery);
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.timestamp;
        
        // Ensure timestamp is always a JS Date object
        const finalTimestamp = timestamp instanceof Timestamp ? timestamp.toDate() : (timestamp instanceof Date ? timestamp : new Date());

        return {
            id: doc.id,
            ...data,
            timestamp: finalTimestamp,
        } as FinancialLedgerEntry;
    });
}

/**
 * Calculates analytics from the ledger.
 */
export async function getLedgerAnalytics(): Promise<{ revenue: number, expenses: number, net: number }> {
    const entries = await getFinancialLedger('*'); // Always calculate on the full ledger
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
    // Ensure the timestamp sent to Firestore is a server timestamp for consistency
    const entryData: any = { ...entry, timestamp: serverTimestamp() };
    
    if (entry.link) {
        entryData.link = entry.link;
    }
    
    await addDoc(ledgerCol, entryData);
}

/**
 * Finds a user by their email address.
 * @returns {Promise<{id: string, email: string, name: string} | null>} The user object or null if not found.
 */
export async function findUserByEmail(email: string): Promise<{id: string, email: string, name: string} | null> {
    if (!email) return null;
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    return { id: userDoc.id, email: userData.email, name: userData.name || 'User' };
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
        adminIssued: 0,
        translationSpend: 0,
        liveSyncSpend: 0,
        liveSyncOnlineSpend: 0,
        languagePackDownload: 0,
        totalAwarded: 0,
        totalSpent: 0,
        totalTokensInSystem: 0,
        p2pTotalVolume: 0,
    };
    
    const logsQuery = collectionGroup(db, 'transactionLogs');
    const logsSnapshot = await getDocs(logsQuery);

    logsSnapshot.forEach(doc => {
        const log = doc.data() as TransactionLog;
        if (log.tokenChange > 0) {
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
                case 'admin_issue':
                    analytics.adminIssued += log.tokenChange;
                    break;
                case 'p2p_transfer':
                    analytics.p2pTotalVolume += log.tokenChange;
                    break;
            }
        } else {
             switch(log.actionType) {
                case 'translation_spend':
                    analytics.translationSpend += Math.abs(log.tokenChange);
                    break;
                case 'live_sync_spend':
                    analytics.liveSyncSpend += Math.abs(log.tokenChange);
                    break;
                 case 'live_sync_online_spend':
                    analytics.liveSyncOnlineSpend += Math.abs(log.tokenChange);
                    break;
                case 'p2p_transfer':
                    // This is the sender's side, handled by the receiver's positive log to avoid double counting.
                    break;
                case 'language_pack_download':
                    analytics.languagePackDownload += Math.abs(log.tokenChange);
                    break;
             }
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn + analytics.adminIssued;
    analytics.totalSpent = analytics.translationSpend + analytics.liveSyncSpend + analytics.liveSyncOnlineSpend + analytics.languagePackDownload;
    analytics.totalTokensInSystem = analytics.purchased + analytics.totalAwarded;

    return analytics;
}


/**
 * Fetches token transaction logs, optionally filtering by user email.
 */
export async function getTokenLedger(emailFilter: string = ''): Promise<TokenLedgerEntry[]> {
  try {
    let allLogs: TokenLedgerEntry[] = [];
    const lowercasedFilter = emailFilter.toLowerCase().trim();

    if (!lowercasedFilter) {
        return [];
    }

    let usersSnapshot;
    const usersRef = collection(db, 'users');

    if (lowercasedFilter === '*') {
        usersSnapshot = await getDocs(usersRef);
    } else {
        const userQuery = query(usersRef, where('email', '==', lowercasedFilter));
        usersSnapshot = await getDocs(userQuery);
    }
    
    if (usersSnapshot.empty && lowercasedFilter !== '*') {
        return []; // No user found for the specific email filter
    }

    const logFetchPromises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const userEmail = userDoc.data().email || 'Unknown';
      const logsRef = collection(db, 'users', userId, 'transactionLogs');
      const logsSnapshot = await getDocs(logsRef);
      
      const userLogs: TokenLedgerEntry[] = [];
      logsSnapshot.forEach((logDoc) => {
        const logData = logDoc.data() as TransactionLog;
        if(logData.tokenChange !== 0 || logData.actionType === 'p2p_transfer') {
            userLogs.push({
            ...logData,
            id: logDoc.id,
            userId: userId,
            userEmail: userEmail,
            timestamp: (logData.timestamp as Timestamp).toDate(),
            });
        }
      });
      return userLogs;
    });

    const userLogArrays = await Promise.all(logFetchPromises);
    allLogs = userLogArrays.flat();
    allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return allLogs;

  } catch (error) {
    console.error('Error fetching token ledger:', error);
    throw error;
  }
}



