
import type { FieldValue, Timestamp } from 'firebase/firestore';
import type { AzureLanguageCode } from './azure-languages';

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
    createdAt: FieldValue;
    status: 'active' | 'closed';
    invitedEmails: string[];
    emceeEmails: string[];
    lastActivityAt?: FieldValue;
    blockedUsers?: BlockedUser[];
    summary?: RoomSummary;
    transcript?: Transcript;
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
    actionType: 'translation_spend' | 'practice_earn' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend';
    tokenChange: number;
    timestamp: FieldValue;
    description: string;
    duration?: number; // Optional: duration in milliseconds for usage-based transactions
}

export type PaymentLog = {
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    tokensPurchased: number;
    createdAt: FieldValue;
}

    
