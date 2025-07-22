import type { FieldValue } from 'firebase/firestore';
import type { AzureLanguageCode } from './azure-languages';

export type SyncRoom = {
    id: string;
    topic: string;
    creatorUid: string;
    createdAt: FieldValue;
    status: 'active' | 'closed';
    invitedEmails: string[];
    activeSpeakerUid: string | null;
    emceeUids: string[];
}

export type Participant = {
    uid: string;
    name: string;
    email: string;
    selectedLanguage: AzureLanguageCode | '';
}

export type RoomMessage = {
    id:string;
    text: string;
    speakerName: string;
    speakerUid: string;
    speakerLanguage: AzureLanguageCode | '';
    createdAt: FieldValue;
}

export type TransactionLog = {
    actionType: 'translation_spend' | 'practice_earn' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend';
    tokenChange: number;
    timestamp: FieldValue;
    description: string;
    duration?: number; // Optional: duration in minutes for usage-based transactions
}

export type PaymentLog = {
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    tokensPurchased: number;
    createdAt: FieldValue;
}
