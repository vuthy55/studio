

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
    firstMessageAt?: any; // Timestamp of the first message
    endingReminderSent?: boolean; // Flag to prevent duplicate end-of-meeting reminders
    effectiveEndTime?: any; // Timestamp when the room will close based on current funding
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
    speakerLanguage?: AzureLanguageCode | '';
    createdAt: Timestamp;
    // New fields for special system messages
    type?: 'reminder' | 'system';
    actions?: ('extendMeeting')[];
}

export type Vibe = {
    id: string;
    topic: string;
    tags: string[]; // Added for tagging feature
    isPublic: boolean;
    creatorId: string;
    creatorName: string;
    creatorEmail: string;
    createdAt: any; // Using `any` for server, client, and serialized forms
    invitedEmails: string[];
    hostEmails: string[];
    postsCount: number;
    lastPostAt?: any;
    lastPostBy?: string;
    activeMeetupId?: string | null;
    blockedUsers?: BlockedUser[];
    pinnedPostId?: string | null;
    status?: 'under_review' | 'archived';
};

export type Party = {
    id: string;
    title: string;
    description?: string;
    location: string; // Google Maps URL
    startTime: any;
    endTime: any;
    creatorId: string;
    creatorName: string;
    vibeId: string;
    vibeTopic: string;
    rsvps?: string[]; // Array of user UIDs
    isPublic: boolean;
};

export interface ClientParty extends Omit<Party, 'startTime' | 'endTime'> {
    startTime: string; // ISO String
    endTime: string; // ISO String
    distance?: number;
}


export type VibePost = {
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    authorEmail: string;
    createdAt: Timestamp;
    type?: 'user_post' | 'meetup_announcement' | 'system_message' | 'host_announcement';
    meetupDetails?: {
        title: string;
        location: string;
        startTime: string; // ISO string
    };
    translations?: Record<string, string>;
};


export type TransactionLog = {
    actionType: 'translation_spend' | 'practice_earn' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend' | 'admin_issue' | 'p2p_transfer' | 'sync_online_refund' | 'language_pack_download' | 'infohub_intel' | 'save_phrase_spend';
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

export type FriendRequest = {
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
  friends?: string[]; // New: For all social connections
  buddies?: string[]; // Existing: For high-trust safety alerts
  friendRequests?: FriendRequest[];
  referredBy?: string;
  unlockedLanguages?: LanguageCode[];
  downloadedPacks?: LanguageCode[];
  downloadedPhraseCount?: number;
  immediateBuddyAlert?: boolean;
}

export type Report = {
  id: string;
  vibeId: string;
  vibeTopic: string;
  reason: string;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  contentAuthorId: string;
  contentAuthorName: string;
  contentAuthorEmail: string;
  createdAt: any;
  status: 'pending' | 'resolved' | 'dismissed';
}

export type NotificationType = 'p2p_transfer' | 'room_closed' | 'room_closed_summary' | 'edit_request' | 'room_canceled' | 'friend_request' | 'friend_request_accepted' | 'buddy_alert' | 'referral_bonus' | 'ending_soon_reminder' | 'room_invite' | 'vibe_invite' | 'new_report' | 'report_resolved';

export type Notification = {
    id: string;
    userId: string;
    type: NotificationType;
    message: string;
    fromUserName?: string;
    amount?: number;
    roomId?: string;
    vibeId?: string;
    reportId?: string;
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
    createdAt: string; // ISO string
}

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
  size?: number; // Add optional size property
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

export interface Invitation {
    id: string;
    inviterId: string;
    invitedEmail: string;
    createdAt: string; // ISO String for client
    status: 'pending' | 'accepted';
}

export interface CountryIntelData {
    id: string; // country code, e.g. 'KH'
    countryName: string;
    region: string;
    regionalNews: string[];
    neighbours: string[]; // List of country codes
    localNews: string[];
    visaInformation: string;
    etiquette: string[];
    publicHolidays: { date: string; name: string }[];
    emergencyNumbers: string[];
    // New fields for build status
    lastBuildStatus?: 'success' | 'failed';
    lastBuildError?: string | null;
    lastBuildAt?: string; // Changed from FieldValue to string for serialization
}

// ClientVibe is a version of Vibe that is safe to pass to client components
export interface ClientVibe extends Omit<Vibe, 'createdAt' | 'lastPostAt'> {
    id: string;
    createdAt: string; // ISO date string
    lastPostAt?: string; // ISO date string
}
