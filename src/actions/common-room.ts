
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
    try {
        const publicVibesQuery = db.collection('vibes').where('isPublic', '==', true);
        const privateVibesQuery = db.collection('vibes').where('invitedEmails', 'array-contains', userEmail);
        
        const [publicSnapshot, privateSnapshot] = await Promise.all([
            publicVibesQuery.get(),
            privateVibesQuery.get()
        ]);

        const allVibes = new Map<string, Vibe>();

        const processSnapshot = (snapshot: FirebaseFirestore.QuerySnapshot) => {
            snapshot.forEach(doc => {
                if (!allVibes.has(doc.id)) {
                    const data = doc.data();
                    allVibes.set(doc.id, {
                        id: doc.id,
                        ...data,
                        createdAt: (data.createdAt as Timestamp)?.toDate().toISOString(),
                        lastPostAt: (data.lastPostAt as Timestamp)?.toDate().toISOString(),
                    } as Vibe);
                }
            });
        };

        processSnapshot(publicSnapshot);
        processSnapshot(privateSnapshot);

        return Array.from(allVibes.values()).sort((a, b) => {
            const timeA = a.lastPostAt ? new Date(a.lastPostAt).getTime() : new Date(a.createdAt).getTime();
            const timeB = b.lastPostAt ? new Date(b.lastPostAt).getTime() : new Date(b.createdAt).getTime();
            return timeB - timeA;
        });

    } catch (error) {
        console.error("Error fetching vibes:", error);
        return [];
    }
}

export async function inviteToVibe(vibeId: string, emails: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const vibeRef = db.collection('vibes').doc(vibeId);
        const vibeDoc = await vibeRef.get();

        if (!vibeDoc.exists) {
            return { success: false, error: 'Vibe not found.' };
        }
        const vibeData = vibeDoc.data() as Vibe;

        // Add emails to the invite list
        await vibeRef.update({
            invitedEmails: FieldValue.arrayUnion(...emails)
        });

        // Send notifications
        const creatorName = vibeData.creatorName;
        const topic = vibeData.topic;
        const inviteLink = `https://your-app-url/join/${vibeId}`; // Replace with your actual URL

        // Send in-app notifications to existing users
        const existingUsersQuery = db.collection('users').where('email', 'in', emails);
        const existingUsersSnapshot = await existingUsersQuery.get();
        const existingEmails = new Set(existingUsersSnapshot.docs.map(d => d.data().email));

        const batch = db.batch();
        existingUsersSnapshot.forEach(doc => {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: doc.id,
                type: 'vibe_invite',
                message: `${creatorName} has invited you to join the Vibe: "${topic}"`,
                vibeId: vibeId,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        });
        await batch.commit();

        // Send email invites to non-users
        const externalEmails = emails.filter(email => !existingEmails.has(email));
        if (externalEmails.length > 0) {
            await sendVibeInviteEmail({
                to: externalEmails,
                vibeTopic: topic,
                creatorName,
                joinUrl: inviteLink
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
