

import type { FieldValue, Timestamp } from 'firebase/firestore';
import type { AzureLanguageCode } from './azure-languages';
import type { LanguageCode } from './data';

export interface BlockedUser {
    uid: string;
    email: string;
}

export type SummaryParticipant = {
    name: string;
    email: string;
    language: string;
}

export type TranslatedContent = {
    original: string;
    translations: Record<string, string>; // key: language code, value: translated text
}

export type SummaryEdit = {
    editorUid: string;
    editorName: string;
    editorEmail: string;
    editedAt: FieldValue;
};

export type RoomSummary = {
    title: string;
    date: string;
    presentParticipants: SummaryParticipant[];
    absentParticipants: SummaryParticipant[];
    summary: TranslatedContent;
    actionItems: { 
        task: TranslatedContent;
        personInCharge?: string;
        dueDate?: string 
    }[];
    editHistory?: SummaryEdit[];
    allowMoreEdits?: boolean;
};

export type Transcript = {
    title: string;
    date: string;
    presentParticipants: SummaryParticipant[];
    absentParticipants: SummaryParticipant[];
    log: {
        speakerName: string;
        text: string;
        timestamp: string; // ISO string for client-side display
    }[];
};

export type SyncRoom = {
    id: string;
    topic: string;
    creatorUid: string;
    creatorName: string;
    createdAt: any; // Allow for server, client, and serialized forms
    status: 'active' | 'closed' | 'scheduled';
    invitedEmails: string[];
    emceeEmails: string[];
    lastActivityAt?: any;
    blockedUsers?: BlockedUser[];
    summary?: RoomSummary;
    transcript?: Transcript;
    scheduledAt?: any;
    durationMinutes?: number;
    initialCost?: number;
    paymentLogId?: string; // ID of the transaction log for the current cost
    hasStarted?: boolean;
    reminderMinutes?: number;
}

export type Participant = {
    uid: string;
    name: string;
    email: string;
    selectedLanguage: AzureLanguageCode | '';
    isMuted?: boolean;
    joinedAt?: Timestamp;
}

export type RoomMessage = {
    id:string;
    text: string;
    speakerName: string;
    speakerUid: string;
    speakerLanguage: AzureLanguageCode | '';
    createdAt: Timestamp;
}

export type TransactionLog = {
    actionType: 'translation_spend' | 'practice_earn' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend' | 'admin_issue' | 'p2p_transfer' | 'sync_online_refund' | 'language_pack_download';
    tokenChange: number;
    timestamp: FieldValue;
    description: string;
    reason?: string; // Optional: for admin-issued tokens
    duration?: number; // Optional: duration in milliseconds for usage-based transactions
    fromUserId?: string;
    fromUserEmail?: string;
    toUserId?: string;
    toUserEmail?: string;
    refundsTransactionId?: string; // Links a refund to the original transaction
}

export type PaymentLog = {
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    tokensPurchased: number;
    createdAt: FieldValue;
}

export type BuddyRequest = {
    fromUid: string;
    fromName: string;
    fromEmail: string;
};

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  photoURL?: string;
  country?: string;
  mobile?: string;
  role?: 'admin' | 'user';
  tokenBalance?: number;
  searchableName?: string;
  searchableEmail?: string;
  practiceStats?: any;
  syncLiveUsage?: number;
  syncOnlineUsage?: number;
  syncOnlineUsageLastReset?: Timestamp;
  defaultLanguage?: AzureLanguageCode;
  buddies?: string[];
  buddyRequests?: BuddyRequest[];
  referredBy?: string;
  unlockedLanguages?: LanguageCode[];
  downloadedPhraseCount?: number;
  immediateBuddyAlert?: boolean;
}

export type NotificationType = 'p2p_transfer' | 'room_closed' | 'room_closed_summary' | 'edit_request' | 'room_canceled' | 'buddy_request' | 'buddy_request_accepted' | 'buddy_alert' | 'referral_bonus';

export type Notification = {
    id: string;
    userId: string;
    type: NotificationType;
    message: string;
    fromUserName?: string;
    amount?: number;
    roomId?: string;
    createdAt: Timestamp;
    read: boolean;
};
    
export type PracticeHistoryDoc = {
    passCountPerLang?: Record<string, number>;
    failCountPerLang?: Record<string, number>;
    lastAttemptPerLang?: Record<string, any>;
    lastAccuracyPerLang?: Record<string, number>;
};

export type PracticeHistoryState = Record<string, PracticeHistoryDoc>;

export interface DetailedHistory {
    id: string;
    phraseText: string;
    passCount: number;
    failCount: number;
    lastAccuracy: number;
}

export type SavedPhrase = {
    id: string;
    fromLang: LanguageCode;
    toLang: LanguageCode;
    fromText: string;
    toText: string;
}

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
};

export interface FeedbackSubmission {
    id: string;
    category: string;
    comment: string;
    userEmail: string;
    userName: string;
    userId: string;
    createdAt: Timestamp;
    screenshotUrl?: string;
}
