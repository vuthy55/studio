
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Vibe, ClientVibe, Party, ClientParty, BlockedUser } from '@/lib/types';
import { sendVibeInviteEmail } from './email';


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
 * Fetches all public vibes and private vibes the user is invited to.
 * This function is now robust and sanitizes all timestamp fields before returning data.
 */
export async function getVibes(userEmail: string): Promise<ClientVibe[]> {
    if (!userEmail) {
        console.log("[getVibes] No user email provided, returning empty array.");
        return [];
    }

    try {
        console.log(`[getVibes] Fetching all documents from 'vibes' collection for user: ${userEmail}`);
        const vibesSnapshot = await db.collection('vibes').get();
        
        if (vibesSnapshot.empty) {
            console.log("[getVibes] 'vibes' collection is empty.");
            return [];
        }

        const allVibes: ClientVibe[] = [];

        vibesSnapshot.forEach(doc => {
            const data = doc.data();

            const isBlocked = data.blockedUsers?.some((blocked: BlockedUser) => blocked.email.toLowerCase() === userEmail.toLowerCase());
            if (isBlocked) return;

            // Filter logic: include if public or if the user is explicitly invited
            const isInvited = data.invitedEmails?.includes(userEmail);
            if (data.isPublic || isInvited) {
                
                // *** CRITICAL: Sanitize all potential Timestamp fields ***
                const sanitizedData: { [key: string]: any } = { id: doc.id };
                for (const key in data) {
                    const value = data[key];
                    if (value instanceof Timestamp) {
                        sanitizedData[key] = value.toDate().toISOString();
                    } else {
                        sanitizedData[key] = value;
                    }
                }
                
                allVibes.push(sanitizedData as ClientVibe);
            }
        });

        // Sort by last activity date, with a fallback to creation date
        allVibes.sort((a, b) => {
            const dateA = a.lastPostAt ? new Date(a.lastPostAt) : new Date(a.createdAt);
            const dateB = b.lastPostAt ? new Date(b.lastPostAt) : new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });

        console.log(`[getVibes] Successfully fetched and processed ${allVibes.length} vibes.`);
        return allVibes;

    } catch (error) {
        console.error("[getVibes] CRITICAL ERROR fetching vibes:", error);
        return []; // Return an empty array on error to prevent client crashes
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

export async function getUpcomingPublicParties(): Promise<ClientParty[]> {
    try {
        const partiesSnapshot = await db.collectionGroup('parties').get();
        if (partiesSnapshot.empty) {
            return [];
        }

        const now = new Date();
        const publicParties: ClientParty[] = [];

        for (const doc of partiesSnapshot.docs) {
            const data = doc.data();
            const startTime = (data.startTime as Timestamp)?.toDate();
            
            // Filter out past parties first
            if (!startTime || startTime < now) {
                continue;
            }

            // Check if parent vibe is public
            const vibeRef = doc.ref.parent.parent!;
            const vibeDoc = await vibeRef.get();
            
            if (vibeDoc.exists && vibeDoc.data()?.isPublic) {
                publicParties.push({
                    id: doc.id,
                    vibeId: vibeDoc.id,
                    vibeTopic: vibeDoc.data()?.topic || 'A Vibe',
                    ...data,
                    startTime: startTime.toISOString(),
                    endTime: (data.endTime as Timestamp).toDate().toISOString(),
                } as ClientParty);
            }
        }
        
        // Sort remaining parties by start time
        publicParties.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        
        return publicParties;

    } catch (error: any) {
        console.error("Error fetching upcoming public parties:", error);
        return [];
    }
}


export async function getAllMyUpcomingParties(userEmail: string): Promise<ClientParty[]> {
    if (!userEmail) return [];
    
    try {
        const myVibes = await getVibes(userEmail);
        if (myVibes.length === 0) return [];
        
        const now = new Date();
        const allMyParties: ClientParty[] = [];
        
        const partyPromises = myVibes.map(async (vibe) => {
            const partiesRef = db.collection('vibes').doc(vibe.id).collection('parties');
            const q = partiesRef.where('startTime', '>=', now);
            const partiesSnapshot = await q.get();

            partiesSnapshot.forEach(doc => {
                const data = doc.data();
                 allMyParties.push({
                    id: doc.id,
                    vibeId: vibe.id,
                    vibeTopic: vibe.topic || 'A Vibe',
                    ...data,
                    startTime: (data.startTime as Timestamp).toDate().toISOString(),
                    endTime: (data.endTime as Timestamp).toDate().toISOString(),
                } as ClientParty);
            });
        });

        await Promise.all(partyPromises);

        allMyParties.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        
        return allMyParties;

    } catch (error: any) {
        console.error("Error fetching all my upcoming parties:", error);
        return [];
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
