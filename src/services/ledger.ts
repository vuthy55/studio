
'use client';

import { collection, getDocs, addDoc, query, orderBy, Timestamp, collectionGroup, where, limit, getDoc, doc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
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
    adminIssued: number;
    translationSpend: number;
    liveSyncSpend: number;
    liveSyncOnlineSpend: number;
    totalAwarded: number;
    totalSpent: number;
    totalTokensInSystem: number;
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
        totalAwarded: 0,
        totalSpent: 0,
        totalTokensInSystem: 0,
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
                    // In a P2P transfer, the positive change is for the recipient, but it's not "awarded" from the system's perspective
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
                    // This is the sender's side of the P2P transfer
                    // It's a spend from the user's perspective, but not from the system's
                    break;
             }
        }
    });

    analytics.totalAwarded = analytics.signupBonus + analytics.referralBonus + analytics.practiceEarn + analytics.adminIssued;
    analytics.totalSpent = analytics.translationSpend + analytics.liveSyncSpend + analytics.liveSyncOnlineSpend;
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
        // Include all logs, even those with zero token change if they are transfers
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
 * Issues a specified amount of tokens to a user from an admin.
 */
export async function issueTokens(payload: IssueTokensPayload): Promise<{success: boolean, error?: string}> {
    const { email, amount, reason, description, adminUser } = payload;
    
    try {
        const recipient = await findUserByEmail(email);
        if (!recipient) {
            return { success: false, error: `User with email "${email}" not found.` };
        }

        const recipientRef = doc(db, 'users', recipient.id);
        const logRef = doc(collection(recipientRef, 'transactionLogs'));

        const batch = writeBatch(db);
        
        // Increment user's token balance
        batch.update(recipientRef, { tokenBalance: increment(amount) });

        // Create transaction log
        batch.set(logRef, {
            actionType: 'admin_issue',
            tokenChange: amount,
            timestamp: serverTimestamp(),
            reason: reason,
            description: description,
            fromUserId: adminUser.uid,
            fromUserEmail: adminUser.email
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error issuing tokens:", error);
        return { success: false, error: "An unexpected server error occurred." };
    }
}


/**
 * Transfers tokens from one user to another.
 */
export async function transferTokens(payload: TransferTokensPayload): Promise<{success: boolean, error?: string}> {
    const { fromUserId, fromUserEmail, toUserEmail, amount, description } = payload;

    if (fromUserEmail.toLowerCase() === toUserEmail.toLowerCase()) {
        return { success: false, error: "Cannot transfer tokens to yourself." };
    }
    
    try {
        const recipient = await findUserByEmail(toUserEmail);
        if (!recipient) {
            return { success: false, error: `Recipient with email "${toUserEmail}" not found.` };
        }
        
        const senderRef = doc(db, 'users', fromUserId);
        const recipientRef = doc(db, 'users', recipient.id);

        const batch = writeBatch(db);

        // 1. Check sender's balance
        const senderDoc = await getDoc(senderRef);
        const senderData = senderDoc.data();
        if (!senderDoc.exists() || (senderData?.tokenBalance ?? 0) < amount) {
            return { success: false, error: "Insufficient balance for this transfer." };
        }

        // 2. Debit the sender
        batch.update(senderRef, { tokenBalance: increment(-amount) });
        const senderLogRef = doc(collection(senderRef, 'transactionLogs'));
        batch.set(senderLogRef, {
            actionType: 'p2p_transfer',
            tokenChange: -amount,
            timestamp: serverTimestamp(),
            description: description,
            toUserId: recipient.id,
            toUserEmail: recipient.email
        });

        // 3. Credit the recipient
        batch.update(recipientRef, { tokenBalance: increment(amount) });
        const recipientLogRef = doc(collection(recipientRef, 'transactionLogs'));
        batch.set(recipientLogRef, {
            actionType: 'p2p_transfer',
            tokenChange: amount,
            timestamp: serverTimestamp(),
            description: description,
            fromUserId: fromUserId,
            fromUserEmail: fromUserEmail,
        });

        // 4. Create notification for recipient
        const notificationRef = doc(collection(db, 'notifications'));
        batch.set(notificationRef, {
            userId: recipient.id,
            type: 'p2p_transfer',
            fromUserName: senderData?.name || fromUserEmail,
            amount: amount,
            message: description,
            createdAt: serverTimestamp(),
            read: false,
        });

        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        console.error("Error transferring tokens:", error);
        return { success: false, error: "An unexpected server error occurred." };
    }
}
