
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, getDoc } from 'firebase-admin/firestore';
import { Vibe, ClientVibe, Party, ClientParty, BlockedUser, VibePost, Report, NotificationType } from '@/lib/types';
import { sendVibeInviteEmail } from './email';
import { getAppSettingsAction } from './settings';
import { translateText } from '@/ai/flows/translate-flow';
import type { LanguageCode } from '@/lib/data';
import { detectLanguage } from '@/ai/flows/detect-language-flow';


interface StartVibePayload {
    topic: string;
    isPublic: boolean;
    creatorId: string;
    creatorName: string;
    creatorEmail: string;
    tags: string[];
}

export async function startVibe(payload: StartVibePayload): Promise<{ success: boolean, vibeId?: string, error?: string }> {
    const { topic, isPublic, creatorId, creatorName, creatorEmail, tags } = payload;
    try {
        const newVibeRef = db.collection('vibes').doc();
        const vibeData: Omit<Vibe, 'id' | 'createdAt' | 'lastPostAt'> = {
            topic,
            tags: tags || [],
            isPublic,
            creatorId,
            creatorName,
            creatorEmail: creatorEmail,
            createdAt: FieldValue.serverTimestamp(),
            lastPostAt: FieldValue.serverTimestamp(), // Initialize with creation date
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
 * If the vibe is public, it also adds the poster to the invited list on their first post.
 */
export async function postReply(vibeId: string, content: string, author: { uid: string, name: string, email: string }, type: 'user_post' | 'host_announcement' = 'user_post'): Promise<{ success: boolean; error?: string }> {
    if (!vibeId || !content.trim() || !author) {
        return { success: false, error: 'Missing required information.' };
    }
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const postRef = vibeRef.collection('posts').doc();
        const vibeDoc = await vibeRef.get();
        if (!vibeDoc.exists) {
            return { success: false, error: 'Vibe not found.' };
        }
        const vibeData = vibeDoc.data() as Vibe;

        const batch = db.batch();

        // 1. Create the new post document
        batch.set(postRef, {
            content: content,
            authorId: author.uid,
            authorName: author.name,
            authorEmail: author.email,
            createdAt: FieldValue.serverTimestamp(),
            type: type,
            translations: {},
        });

        const updateData: Record<string, any> = {
            postsCount: FieldValue.increment(1),
            lastPostAt: FieldValue.serverTimestamp(),
            lastPostBy: author.name,
        };

        // 2. If it's a public vibe, add the user to invitedEmails on their first post to "subscribe" them.
        if (vibeData.isPublic && !vibeData.invitedEmails.includes(author.email)) {
            updateData.invitedEmails = FieldValue.arrayUnion(author.email);
        }
        
        // 3. Update the parent Vibe metadata
        batch.update(vibeRef, updateData);

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
        const settings = await getAppSettingsAction();
        const inactivityDays = settings.vibeInactivityDays || 10;
        const archiveThreshold = new Date();
        archiveThreshold.setDate(archiveThreshold.getDate() - inactivityDays);
        
        const allVibesSnapshot = await db.collection('vibes').get();
        const allVibes: Vibe[] = allVibesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vibe));
        debugLog.push(`[INFO] Fetched ${allVibes.length} total vibes from the database.`);

        const myVibes: ClientVibe[] = [];
        const publicVibes: ClientVibe[] = [];

        const activeMyVibes: ClientVibe[] = [];
        const inactiveMyVibes: ClientVibe[] = [];
        const activePublicVibes: ClientVibe[] = [];
        const inactivePublicVibes: ClientVibe[] = [];

        allVibes.forEach(vibe => {
            const isMember = vibe.invitedEmails.includes(userEmail) || vibe.creatorEmail === userEmail;
            
             const clientVibe = JSON.parse(JSON.stringify({
                ...vibe,
                createdAt: (vibe.createdAt as Timestamp)?.toDate(),
                lastPostAt: (vibe.lastPostAt as Timestamp)?.toDate(),
            })) as ClientVibe;
            
            const lastPostDate = clientVibe.lastPostAt ? new Date(clientVibe.lastPostAt) : new Date(clientVibe.createdAt);
            const isInactive = lastPostDate < archiveThreshold;

            if (isMember) {
                if (isInactive) {
                    inactiveMyVibes.push(clientVibe);
                } else {
                    activeMyVibes.push(clientVibe);
                }
            }
            if (vibe.isPublic) {
                 if (isInactive) {
                    inactivePublicVibes.push(clientVibe);
                 } else {
                    activePublicVibes.push(clientVibe);
                 }
            }
        });
        
        activeMyVibes.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());
        inactiveMyVibes.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());
        activePublicVibes.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());
        inactivePublicVibes.sort((a,b) => new Date(b.lastPostAt || b.createdAt).getTime() - new Date(a.lastPostAt || a.createdAt).getTime());
        
        const sortedMyVibes = [...activeMyVibes, ...inactiveMyVibes];
        const sortedPublicVibes = [...activePublicVibes, ...inactivePublicVibes];
        
        debugLog.push(`[INFO] Categorized into ${myVibes.length} 'My Vibes' and ${publicVibes.length} 'Public Vibes'.`);
        
        let allParties: ClientParty[] = [];
        try {
            const now = new Date();
            const allPartiesSnapshot = await db.collectionGroup('parties').where('startTime', '>=', now).get();
            debugLog.push(`[INFO] Fetched ${allPartiesSnapshot.size} total upcoming parties via collectionGroup query.`);
            
            allParties = allPartiesSnapshot.docs.map(doc => {
                const data = doc.data();
                const vibeRef = doc.ref.parent.parent!;
                return {
                    id: doc.id,
                    vibeId: vibeRef.id,
                    ...data,
                    startTime: (data.startTime as Timestamp).toDate().toISOString(),
                    endTime: (data.endTime as Timestamp).toDate().toISOString(),
                } as ClientParty;
            });
        } catch (e: any) {
             debugLog.push(`[WARN] collectionGroup query failed: ${e.message}. Falling back to sequential queries.`);
             const now = new Date();
             const partyPromises = allVibes.map(vibe => 
                db.collection('vibes').doc(vibe.id).collection('parties').where('startTime', '>=', now).get()
            );
            const partySnapshots = await Promise.all(partyPromises);
            partySnapshots.forEach((snapshot, index) => {
                const vibeId = allVibes[index].id;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    allParties.push({
                        id: doc.id,
                        vibeId: vibeId,
                        ...data,
                        startTime: (data.startTime as Timestamp).toDate().toISOString(),
                        endTime: (data.endTime as Timestamp).toDate().toISOString(),
                    } as ClientParty);
                });
            });
            debugLog.push(`[SUCCESS] Fallback fetch complete. Found ${allParties.length} parties.`);
        }

        const vibeMap = new Map(allVibes.map(v => [v.id, v]));
        const myVibeIds = new Set(myVibes.map(v => v.id));

        const myMeetups: ClientParty[] = [];
        const publicMeetups: ClientParty[] = [];

        allParties.forEach(party => {
            const parentVibe = vibeMap.get(party.vibeId);
            if (!parentVibe) {
                debugLog.push(`[WARN] Party ${party.id} has no parent vibe with ID ${party.vibeId}. Skipping.`);
                return;
            };

            party.vibeTopic = parentVibe.topic || 'A Vibe';
            party.isPublic = parentVibe.isPublic;
            
            if (myVibeIds.has(party.vibeId)) {
                myMeetups.push(party);
            }
            
            if (parentVibe.isPublic) {
                publicMeetups.push(party);
            }
        });

        debugLog.push(`[INFO] Categorized into ${myMeetups.length} 'My Meetups' and ${publicMeetups.length} 'Public Meetups'.`);
        
        myMeetups.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        publicMeetups.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        debugLog.push(`[SUCCESS] Data fetch and processing complete.`);
        return { myVibes: sortedMyVibes, publicVibes: sortedPublicVibes, myMeetups, publicMeetups, debugLog };

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

interface TranslatePostPayload {
    postId: string;
    vibeId: string;
    userId: string;
    targetLanguage: string;
}

export async function translateVibePost(payload: TranslatePostPayload): Promise<{ translatedText?: string; error?: string }> {
  const { postId, vibeId, userId, targetLanguage } = payload;

  try {
    const postRef = db.collection('vibes').doc(vibeId).collection('posts').doc(postId);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
        return { error: "Post not found." };
    }
    const postData = postDoc.data() as VibePost;
    const fromLanguage = await detectLanguage({ text: postData.content });

    const settings = await getAppSettingsAction();
    const cost = settings.translationCost || 1;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { error: "User not found." };
    }

    const userBalance = userDoc.data()?.tokenBalance || 0;
    if (userBalance < cost) {
      return { error: "Insufficient tokens for this translation." };
    }

    const translationResult = await translateText({ text: postData.content, fromLanguage: fromLanguage.language, toLanguage: targetLanguage });
    if (!translationResult.translatedText) {
        return { error: 'Translation failed.' };
    }

    const batch = db.batch();
    batch.update(userRef, { tokenBalance: FieldValue.increment(-cost) });
    const logRef = userRef.collection('transactionLogs').doc();
    batch.set(logRef, {
        actionType: 'translation_spend',
        tokenChange: -cost,
        timestamp: FieldValue.serverTimestamp(),
        description: `Translated a Vibe post: "${postData.content.substring(0, 30)}..."`,
    });

    // Save the translation to the post document
    batch.update(postRef, {
        [`translations.${targetLanguage}`]: translationResult.translatedText
    });

    await batch.commit();

    return { translatedText: translationResult.translatedText };
  } catch (error: any) {
    console.error('Error translating Vibe post:', error);
    return { error: 'An unexpected server error occurred.' };
  }
}

export async function deleteVibe(vibeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const vibeDoc = await vibeRef.get();

        if (!vibeDoc.exists) {
            return { success: true }; // Already deleted
        }

        const vibeData = vibeDoc.data() as Vibe;
        if (vibeData.creatorId !== userId) {
            return { success: false, error: 'You are not the creator of this Vibe.' };
        }

        // It's safer to use the admin SDK for cross-collection deletes,
        // so we'll just delete the main doc for now. Sub-collections can be cleaned up later.
        await vibeRef.delete();
        
        // A more robust solution would be to call a Cloud Function to delete subcollections.
        // For now, this provides the core functionality.

        return { success: true };
    } catch (error: any) {
        console.error("Error deleting vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

export async function pinPost(vibeId: string, postId: string | null): Promise<{ success: boolean; error?: string }> {
    if (!vibeId) {
        return { success: false, error: 'Vibe ID is required.' };
    }
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        await vibeRef.update({
            pinnedPostId: postId 
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error pinning post:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

export async function deletePost(vibeId: string, postId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!vibeId || !postId || !userId) {
        return { success: false, error: 'Missing required information.' };
    }

    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const postRef = vibeRef.collection('posts').doc(postId);

        const postDoc = await postRef.get();
        if (!postDoc.exists) {
            return { success: true }; // Already deleted
        }

        const postData = postDoc.data();
        if (postData?.authorId !== userId) {
            return { success: false, error: 'Permission denied. You can only delete your own posts.' };
        }

        const batch = db.batch();
        batch.delete(postRef);
        batch.update(vibeRef, { postsCount: FieldValue.increment(-1) });
        
        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error("Error deleting post:", error);
        return { success: false, error: 'An unexpected server error occurred while deleting the post.' };
    }
}


interface ReportContentPayload {
    vibeId: string;
    reason: string;
    reporter: { uid: string; name: string; email: string };
}

async function getAdminUids(): Promise<string[]> {
    const adminsQuery = db.collection('users').where('role', '==', 'admin');
    const snapshot = await adminsQuery.get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => doc.id);
}

export async function reportContent(payload: ReportContentPayload): Promise<{ success: boolean; error?: string }> {
    const { vibeId, reason, reporter } = payload;
    if (!vibeId || !reason || !reporter) {
        return { success: false, error: 'Missing required information.' };
    }

    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const vibeDoc = await vibeRef.get();
        if (!vibeDoc.exists) {
            return { success: false, error: 'Vibe not found.' };
        }
        const vibeData = vibeDoc.data() as Vibe;

        const reportRef = db.collection('reports').doc();
        const batch = db.batch();

        const reportData: Omit<Report, 'id'> = {
            vibeId,
            vibeTopic: vibeData.topic,
            reason,
            reporterId: reporter.uid,
            reporterName: reporter.name,
            reporterEmail: reporter.email,
            contentAuthorId: vibeData.creatorId,
            contentAuthorName: vibeData.creatorName,
            contentAuthorEmail: vibeData.creatorEmail,
            createdAt: Timestamp.now(),
            status: 'pending',
        };
        batch.set(reportRef, reportData);

        const adminUids = await getAdminUids();
        const notificationMessage = `A Vibe has been reported: "${vibeData.topic}"`;
        const notificationType: NotificationType = 'new_report';

        adminUids.forEach(adminId => {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: adminId,
                type: notificationType,
                message: notificationMessage,
                vibeId,
                reportId: reportRef.id,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        });
        
        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error("Error reporting content:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}
