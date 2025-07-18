
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
    isEmcee: boolean; // Note: This is now derived from room.emceeUids, but kept for potential future direct use
}

export type RoomMessage = {
    id: string;
    text: string;
    speakerName: string;
    speakerUid: string;
    speakerLanguage: AzureLanguageCode | '';
    createdAt: FieldValue;
}

    