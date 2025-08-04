
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Vibe } from '@/lib/types';
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
        const vibeData: Omit<Vibe, 'id'> = {
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

export async function getVibes(userEmail: string): Promise<Vibe[]> {
    console.log(`[DEBUG] Server Action getVibes: Called for user ${userEmail}`);
    try {
        const vibesRef = db.collection('vibes');
        
        console.log('[DEBUG] Server Action getVibes: Fetching all vibe documents.');
        const allVibesSnapshot = await vibesRef.get();
        console.log(`[DEBUG] Server Action getVibes: Found ${allVibesSnapshot.docs.length} total vibes in the collection.`);

        if (allVibesSnapshot.empty) {
            return [];
        }

        const accessibleVibes = allVibesSnapshot.docs
            .map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data } as Vibe;
            })
            .filter(vibe => {
                return vibe.isPublic || (vibe.invitedEmails && vibe.invitedEmails.includes(userEmail));
            })
            .map(vibe => {
                // Safely convert Timestamps to ISO strings for serialization
                const toISO = (ts: any): string | undefined => {
                    if (!ts) return undefined;
                    if (ts instanceof Timestamp) return ts.toDate().toISOString();
                    if (ts._seconds) return new Timestamp(ts._seconds, ts._nanoseconds).toDate().toISOString();
                    return new Date(0).toISOString();
                };

                return {
                    ...vibe,
                    createdAt: toISO(vibe.createdAt) || new Date(0).toISOString(),
                    lastPostAt: toISO(vibe.lastPostAt),
                };
            });
        
        console.log(`[DEBUG] Server Action getVibes: Returning ${accessibleVibes.length} accessible vibes.`);
        return accessibleVibes;

    } catch (error) {
        console.error("[DEBUG] Server Action getVibes: CRITICAL ERROR fetching vibes:", error);
        throw new Error("An unexpected server error occurred while fetching vibes.");
    }
}


export async function inviteToVibe(vibeId: string, emails: string[], vibeTopic: string, creatorName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        
        await vibeRef.update({
            invitedEmails: FieldValue.arrayUnion(...emails)
        });

        const joinUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/join/${vibeId}`;
        
        const existingUsersQuery = db.collection('users').where('email', 'in', emails);
        const existingUsersSnapshot = await existingUsersQuery.get();
        const existingEmails = new Set(existingUsersSnapshot.docs.map(d => d.data().email));

        const batch = db.batch();
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

        const externalEmails = emails.filter(email => !existingEmails.has(email));
        if (externalEmails.length > 0) {
            await sendVibeInviteEmail({
                to: externalEmails,
                vibeTopic: vibeTopic,
                creatorName,
                joinUrl: joinUrl
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error inviting to vibe:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

export async function postReply(vibeId: string, content: string, user: { uid: string, name: string }) {
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const postRef = vibeRef.collection('posts').doc();

        const batch = db.batch();
        
        batch.set(postRef, {
            content,
            authorId: user.uid,
            authorName: user.name,
            createdAt: FieldValue.serverTimestamp(),
        });

        batch.update(vibeRef, {
            postsCount: FieldValue.increment(1),
            lastPostAt: FieldValue.serverTimestamp(),
            lastPostBy: user.name,
        });

        await batch.commit();

        return { success: true };
    } catch (error) {
        console.error("Error posting reply:", error);
        return { success: false, error: "Failed to post reply." };
    }
}
