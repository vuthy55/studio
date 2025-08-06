
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Vibe, ClientVibe, Party, ClientParty, BlockedUser } from '@/lib/types';
import { sendVibeInviteEmail } from './email';
import { getDocs, where as clientWhere, query as clientQuery, collection as clientCollection } from 'firebase/firestore';


interface StartVibePayload {
    topic: string;
    isPublic: boolean;
    creatorId: string;
    creatorName: string;
    creatorEmail: string;
}

export async function startVibe(payload: StartVibePayload): Promise<{ success: boolean, vibeId?: string, error?: string }> {
    const { topic, isPublic, creatorId, creatorName, creatorEmail } = payload;
    try {
        const newVibeRef = db.collection('vibes').doc();
        const vibeData: Omit<Vibe, 'id' | 'createdAt' | 'lastPostAt'> = {
            topic,
            isPublic,
            creatorId,
            creatorName,
            creatorEmail: creatorEmail,
            createdAt: FieldValue.serverTimestamp(),
            invitedEmails: isPublic ? [] : [creatorEmail], // Only add creator to private vibes
            hostEmails: [creatorEmail],
            postsCount: 0,
            activeMeetupId: null,
        };
        await newVibeRef.set(vibeData);
        return { success: true, vibeId: newVibeRef.id };
    } catch (error: any) {
        console.error("Error starting vibe:", error);
        return { success: false, error: 'Failed to create Vibe on the server.' };
    }
}


/**
 * Adds a new post to a Vibe and updates the Vibe's metadata.
 */
export async function postReply(vibeId: string, content: string, author: { uid: string, name: string, email: string }): Promise<{ success: boolean; error?: string }> {
    if (!vibeId || !content.trim() || !author) {
        return { success: false, error: 'Missing required information.' };
    }
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const postRef = vibeRef.collection('posts').doc();

        const batch = db.batch();

        // 1. Create the new post document
        batch.set(postRef, {
            content: content,
            authorId: author.uid,
            authorName: author.name,
            authorEmail: author.email,
            createdAt: FieldValue.serverTimestamp(),
            type: 'user_post',
        });

        // 2. Update the parent Vibe metadata
        batch.update(vibeRef, {
            postsCount: FieldValue.increment(1),
            lastPostAt: FieldValue.serverTimestamp(),
            lastPostBy: author.name,
        });

        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        console.error("Error posting reply:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

export async function inviteToVibe(vibeId: string, emails: string[], vibeTopic: string, creatorName: string, inviterId: string, sendEmail: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        
        const batch = db.batch();

        // Atomically add new emails to the invited list
        batch.update(vibeRef, {
            invitedEmails: FieldValue.arrayUnion(...emails)
        });
        
        // Find existing users to send in-app notifications
        const existingUsersQuery = db.collection('users').where('email', 'in', emails);
        const existingUsersSnapshot = await existingUsersQuery.get();
        const existingEmails = new Set(existingUsersSnapshot.docs.map(d => d.data().email));

        // Create notifications for existing users
        existingUsersSnapshot.forEach(doc => {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: doc.id,
                type: 'vibe_invite',
                message: `${creatorName} has invited you to join the Vibe: "${vibeTopic}"`,
                vibeId: vibeId,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        });
        
        await batch.commit();
        
        // Handle sending emails to non-users if requested
        if (sendEmail) {
            const externalEmails = emails.filter(email => !existingEmails.has(email));
            if (externalEmails.length > 0) {
                const joinUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/join-vibe/${vibeId}?ref=${inviterId}`;
                await sendVibeInviteEmail({
                    to: externalEmails,
                    vibeTopic: vibeTopic,
                    creatorName: creatorName,
                    joinUrl: joinUrl
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error inviting to vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


export async function updateHostStatus(vibeId: string, targetEmail: string, shouldBeHost: boolean): Promise<{ success: boolean, error?: string }> {
    if (!vibeId || !targetEmail) {
        return { success: false, error: "Vibe ID and target email are required." };
    }

    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        
        if (shouldBeHost) {
            await vibeRef.update({
                hostEmails: FieldValue.arrayUnion(targetEmail)
            });
        } else {
            // Safety check: Don't allow creator to be demoted
            const vibeDoc = await vibeRef.get();
            const creatorEmail = vibeDoc.data()?.creatorEmail;
            if (targetEmail === creatorEmail) {
                return { success: false, error: "The original creator cannot be demoted." };
            }

            await vibeRef.update({
                hostEmails: FieldValue.arrayRemove(targetEmail)
            });
        }

        return { success: true };

    } catch (error: any) {
        console.error("Error updating host status:", error);
        return { success: false, error: "An unexpected server error occurred." };
    }
}


interface PlanPartyPayload {
    vibeId: string;
    title: string;
    location: string;
    description: string;
    startTime: string; // ISO string
    endTime: string; // ISO string
    creatorId: string;
    creatorName: string;
}

export async function planParty(payload: PlanPartyPayload): Promise<{ success: boolean; error?: string }> {
    const { vibeId, ...partyData } = payload;
    
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const partyRef = vibeRef.collection('parties').doc();
        const announcementRef = vibeRef.collection('posts').doc();
        
        const batch = db.batch();

        // 1. Create the new party document
        batch.set(partyRef, {
            ...partyData,
            rsvps: [partyData.creatorId], // Creator auto-RSVPs
            startTime: Timestamp.fromDate(new Date(partyData.startTime)),
            endTime: Timestamp.fromDate(new Date(partyData.endTime)),
        });

        // 2. Set this as the active meetup for the vibe
        batch.update(vibeRef, { activeMeetupId: partyRef.id });

        // 3. Create an announcement post in the chat
        batch.set(announcementRef, {
            type: 'meetup_announcement',
            content: `${partyData.creatorName} planned a meetup: "${partyData.title}"`,
            authorId: 'system',
            authorName: 'VibeSync Bot',
            authorEmail: 'system@vibesync.com',
            createdAt: FieldValue.serverTimestamp(),
            meetupDetails: {
                title: partyData.title,
                location: partyData.location,
                startTime: partyData.startTime, // Store as ISO string
            }
        });
        
        await batch.commit();

        return { success: true };
    } catch (error: any)
        {
        console.error("Error planning party:", error);
        return { success: false, error: 'Failed to create party on the server.' };
    }
}

export async function rsvpToMeetup(vibeId: string, partyId: string, userId: string, isRsvping: boolean): Promise<{ success: boolean, error?: string }> {
    if (!vibeId || !partyId || !userId) {
        return { success: false, error: 'Missing required information.' };
    }
    try {
        const partyRef = db.collection('vibes').doc(vibeId).collection('parties').doc(partyId);
        
        if (isRsvping) {
            await partyRef.update({
                rsvps: FieldValue.arrayUnion(userId)
            });
        } else {
            await partyRef.update({
                rsvps: FieldValue.arrayRemove(userId)
            });
        }
        return { success: true };
    } catch (error: any) {
        console.error("Error RSVPing to meetup:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

export async function getCommonRoomData(userEmail: string): Promise<{
    myVibes: ClientVibe[],
    publicVibes: ClientVibe[],
    myMeetups: ClientParty[],
    publicMeetups: ClientParty[],
    debugLog: string[]
}> {
    const debugLog: string[] = [];
    
    if (!userEmail) {
        debugLog.push('[FAIL] userEmail not provided.');
        return { myVibes: [], publicVibes: [], myMeetups: [], publicMeetups: [], debugLog };
    }
    debugLog.push(`[INFO] Starting data fetch for user: ${userEmail}`);

    try {
        // --- Step 1: Fetch all vibes in a single query ---
        const vibesSnapshot = await db.collection('vibes').get();
        const allVibes: Vibe[] = vibesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vibe));
        debugLog.push(`[INFO] Fetched ${allVibes.length} total vibes from the database.`);

        // --- Step 2: Categorize vibes ---
        const myVibesClient: ClientVibe[] = [];
        const publicVibesClient: ClientVibe[] = [];
        const myVibeIds = new Set<string>();

        allVibes.forEach(vibe => {
             // Sanitize vibe by converting Timestamps to ISO strings
            const clientVibe: ClientVibe = JSON.parse(JSON.stringify({
                ...vibe,
                createdAt: (vibe.createdAt as Timestamp)?.toDate()?.toISOString(),
                lastPostAt: (vibe.lastPostAt as Timestamp)?.toDate()?.toISOString(),
            }));

            if (vibe.invitedEmails.includes(userEmail) || vibe.creatorEmail === userEmail) {
                myVibesClient.push(clientVibe);
                myVibeIds.add(vibe.id);
            }
            if (vibe.isPublic) {
                 publicVibesClient.push(clientVibe);
            }
        });
        debugLog.push(`[INFO] Categorized into ${myVibesClient.length} 'My Vibes' and ${publicVibesClient.length} 'Public Vibes'.`);

        // --- Step 3: Fetch all upcoming parties by iterating through vibes ---
        const now = new Date();
        let allParties: ClientParty[] = [];
        
        for (const vibe of allVibes) {
            const partiesRef = db.collection('vibes').doc(vibe.id).collection('parties');
            const q = partiesRef.where('startTime', '>=', now);
            const partiesSnapshot = await q.get();

            partiesSnapshot.forEach(doc => {
                const data = doc.data();
                allParties.push({
                    id: doc.id,
                    vibeId: vibe.id,
                    ...data,
                    startTime: (data.startTime as Timestamp).toDate().toISOString(),
                    endTime: (data.endTime as Timestamp).toDate().toISOString(),
                    vibeTopic: vibe.topic || 'A Vibe',
                    isPublic: vibe.isPublic,
                } as ClientParty);
            });
        }
        debugLog.push(`[INFO] Fetched ${allParties.length} total upcoming parties by iterating through vibes.`);
        
        // --- Step 4: Categorize meetups ---
        const myMeetups: ClientParty[] = [];
        const publicMeetups: ClientParty[] = [];

        allParties.forEach(party => {
            if (myVibeIds.has(party.vibeId)) {
                myMeetups.push(party);
            }
            if (party.isPublic) {
                publicMeetups.push(party);
            }
        });

        debugLog.push(`[INFO] Categorized into ${myMeetups.length} 'My Meetups' and ${publicMeetups.length} 'Public Meetups'.`);
        
        // --- Step 5: Sort everything before returning ---
        myMeetups.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        publicMeetups.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        myVibesClient.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());
        publicVibesClient.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());

        debugLog.push(`[SUCCESS] Data fetch and processing complete.`);
        return { myVibes: myVibesClient, publicVibes: publicVibesClient, myMeetups, publicMeetups, debugLog };

    } catch (error: any) {
        console.error("Error fetching common room data:", error);
        debugLog.push(`[CRITICAL] An error occurred: ${error.message}`);
        return { myVibes: [], publicVibes: [], myMeetups: [], publicMeetups: [], debugLog };
    }
}



export async function editMeetup(vibeId: string, partyId: string, updates: Partial<Party>, editorName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const partyRef = db.collection('vibes').doc(vibeId).collection('parties').doc(partyId);
        const announcementRef = db.collection('vibes').doc(vibeId).collection('posts').doc();

        const batch = db.batch();

        const updatePayload: Record<string, any> = { ...updates };
        if (updates.startTime) {
            updatePayload.startTime = Timestamp.fromDate(new Date(updates.startTime));
        }
        if (updates.endTime) {
            updatePayload.endTime = Timestamp.fromDate(new Date(updates.endTime));
        }

        batch.update(partyRef, updatePayload);
        
        const changeDescriptions = Object.keys(updates).map(key => {
            if (key === 'startTime' || key === 'endTime') return `the ${key.replace('Time', ' time')}`;
            if (key === 'description') return `the description`;
            return `the ${key}`;
        }).join(', ');

        batch.set(announcementRef, {
            type: 'system_message',
            content: `${editorName} updated the meetup: ${changeDescriptions} changed for "${updates.title}".`,
            authorId: 'system',
            authorName: 'VibeSync Bot',
            authorEmail: 'system@vibesync.com',
            createdAt: FieldValue.serverTimestamp(),
        });

        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error("Error editing meetup:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

/**
 * Removes a participant by a host. This is a "hard" removal that blocks them.
 */
export async function removeParticipantFromVibe(vibeId: string, userToRemove: { uid: string, email: string }): Promise<{ success: boolean; error?: string }> {
    if (!vibeId || !userToRemove) {
        return { success: false, error: 'Missing required information.' };
    }
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const batch = db.batch();

        const userToBlock: BlockedUser = { uid: userToRemove.uid, email: userToRemove.email };

        batch.update(vibeRef, {
            blockedUsers: FieldValue.arrayUnion(userToBlock),
            invitedEmails: FieldValue.arrayRemove(userToRemove.email),
            hostEmails: FieldValue.arrayRemove(userToRemove.email)
        });

        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error removing participant from Vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

/**
 * Allows a user to voluntarily leave a Vibe. This is a "soft" removal.
 */
export async function leaveVibe(vibeId: string, userEmail: string): Promise<{ success: boolean, error?: string }> {
    if (!vibeId || !userEmail) {
        return { success: false, error: 'Missing required information.' };
    }
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        await vibeRef.update({
            invitedEmails: FieldValue.arrayRemove(userEmail),
            hostEmails: FieldValue.arrayRemove(userEmail) // Also remove as host if they were one
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error leaving Vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


export async function unblockParticipantFromVibe(vibeId: string, requesterEmail: string, userToUnblock: BlockedUser): Promise<{ success: boolean; error?: string }> {
    if (!vibeId || !requesterEmail || !userToUnblock) {
        return { success: false, error: 'Missing required information.' };
    }

    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const vibeDoc = await vibeRef.get();
        if (!vibeDoc.exists) {
            return { success: false, error: 'Vibe not found.' };
        }

        const vibeData = vibeDoc.data() as Vibe;
        const isHost = vibeData.hostEmails.includes(requesterEmail);
        if (!isHost) {
            return { success: false, error: 'Permission denied. Only hosts can unblock users.' };
        }

        await vibeRef.update({
            blockedUsers: FieldValue.arrayRemove(userToUnblock)
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error unblocking participant from Vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
