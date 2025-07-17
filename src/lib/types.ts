
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
    uid: string | null; // Null for guests
    name: string;
    email: string;
    selectedLanguage: AzureLanguageCode | '';
    isEmcee: boolean;
    isMuted: boolean;
}
