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

// This type represents the "sanitized" Vibe object that is safe to send to the client.
export interface ClientVibe extends Omit<Vibe, 'createdAt' | 'lastPostAt'> {
    createdAt: string;
    lastPostAt?: string;
}


export async function getVibes(userEmail: string): Promise<ClientVibe[]> {
    if (!userEmail) return [];

    try {
        const vibesSnapshot = await db.collection('vibes').get();
        if (vibesSnapshot.empty) {
            return [];
        }

        // Helper to safely convert Firestore Timestamps to ISO strings
        const toISO = (ts: any): string => {
            if (!ts) return new Date(0).toISOString();
            if (ts instanceof Timestamp) return ts.toDate().toISOString();
            if (ts._seconds && typeof ts._seconds === 'number') {
                return new Timestamp(ts._seconds, ts._nanoseconds || 0).toDate().toISOString();
            }
            if (typeof ts === 'string' && !isNaN(Date.parse(ts))) return ts;
            return new Date(0).toISOString(); // Fallback for unexpected formats
        };

        const allVibes: ClientVibe[] = [];
        vibesSnapshot.forEach(doc => {
            const data = doc.data() as Vibe;
            
            // Filter logic: include if public or if the user is explicitly invited
            const isInvited = data.invitedEmails?.includes(userEmail);
            if (data.isPublic || isInvited) {
                 allVibes.push({
                    ...(data as any), // Spread the original data
                    id: doc.id,
                    createdAt: toISO(data.createdAt),
                    lastPostAt: data.lastPostAt ? toISO(data.lastPostAt) : undefined,
                });
            }
        });
        
        // Sort by last activity date, with a fallback to creation date
        allVibes.sort((a, b) => {
            const dateA = a.lastPostAt ? new Date(a.lastPostAt) : new Date(a.createdAt);
            const dateB = b.lastPostAt ? new Date(b.lastPostAt) : new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });

        return allVibes;

    } catch (error) {
        console.error("[getVibes] Error fetching vibes:", error);
        return []; // Return an empty array on error to prevent client crashes
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
