
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Vibe, ClientVibe } from '@/lib/types';
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
            createdAt: FieldValue.serverTimestamp(),
            invitedEmails: isPublic ? [] : [creatorEmail], // Only add creator to private vibes
            hostEmails: [creatorEmail],
            postsCount: 0,
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
        
        // Atomically add new emails to the invited list
        await vibeRef.update({
            invitedEmails: FieldValue.arrayUnion(...emails)
        });

        // Find existing users to send in-app notifications
        const existingUsersQuery = db.collection('users').where('email', 'in', emails);
        const existingUsersSnapshot = await existingUsersQuery.get();
        const existingEmails = new Set(existingUsersSnapshot.docs.map(d => d.data().email));

        // Create notifications for existing users in a batch
        const notificationBatch = db.batch();
        existingUsersSnapshot.forEach(doc => {
            const notificationRef = db.collection('notifications').doc();
            notificationBatch.set(notificationRef, {
                userId: doc.id,
                type: 'vibe_invite',
                message: `${creatorName} has invited you to join the Vibe: "${vibeTopic}"`,
                vibeId: vibeId,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        });
        await notificationBatch.commit();
        
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
