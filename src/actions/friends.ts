
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { FriendRequest, UserProfile, Invitation } from '@/lib/types';
import { findUserByEmailAdmin } from '@/lib/firebase-utils';


/**
 * Sends a friend request from one user to another.
 */
export async function sendFriendRequest(
    fromUser: { uid: string, name: string, email: string },
    toEmail: string
): Promise<{success: boolean, error?: string}> {
    if (fromUser.email.toLowerCase() === toEmail.toLowerCase()) {
        return { success: false, error: 'You cannot add yourself as a friend.' };
    }
    
    try {
        const toUser = await findUserByEmailAdmin(toEmail);
        if (!toUser) {
            return { success: false, error: `User with email "${toEmail}" not found.` };
        }
        
        const toUserRef = db.collection('users').doc(toUser.id);
        const toUserDoc = await toUserRef.get();
        const toUserData = toUserDoc.data();

        // Check if they are already friends
        if (toUserData?.friends?.includes(fromUser.uid)) {
            return { success: false, error: `You are already friends with ${toEmail}.` };
        }
        // Check if a request has already been sent
        if (toUserData?.friendRequests?.some((req: FriendRequest) => req.fromUid === fromUser.uid)) {
            return { success: false, error: 'You have already sent a request to this user.' };
        }

        const newRequest: FriendRequest = {
            fromUid: fromUser.uid,
            fromName: fromUser.name,
            fromEmail: fromUser.email,
        };

        // Create notification and add request in one atomic operation
        const batch = db.batch();

        batch.update(toUserRef, {
            friendRequests: FieldValue.arrayUnion(newRequest)
        });

        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            userId: toUser.id,
            type: 'friend_request',
            fromUserName: fromUser.name,
            message: `${fromUser.name} wants to add you as a friend.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error sending friend request:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}

/**
 * Accepts a friend request.
 */
export async function acceptFriendRequest(
    currentUser: { uid: string, name: string },
    request: FriendRequest
): Promise<{success: boolean, error?: string}> {
     try {
        const currentUserRef = db.collection('users').doc(currentUser.uid);
        const newFriendRef = db.collection('users').doc(request.fromUid);

        const batch = db.batch();

        // Add each user to the other's friends list
        batch.update(currentUserRef, {
            friends: FieldValue.arrayUnion(request.fromUid),
            friendRequests: FieldValue.arrayRemove(request) // Remove the request
        });

        batch.update(newFriendRef, {
            friends: FieldValue.arrayUnion(currentUser.uid)
        });

        // Send a notification back to the person who sent the request
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            userId: request.fromUid,
            type: 'friend_request_accepted', 
            fromUserName: currentUser.name,
            message: `${currentUser.name} accepted your friend request!`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        });


        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        console.error("Error accepting friend request:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


/**
 * Declines a friend request.
 */
export async function declineFriendRequest(
    currentUserUid: string,
    request: FriendRequest
): Promise<{success: boolean, error?: string}> {
     try {
        const currentUserRef = db.collection('users').doc(currentUserUid);
        await currentUserRef.update({
             friendRequests: FieldValue.arrayRemove(request)
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error declining friend request:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

/**
 * Removes a friend from the user's list. This is a one-way removal.
 */
export async function removeFriend(
    currentUserUid: string,
    friendToRemoveUid: string
): Promise<{success: boolean, error?: string}> {
     try {
        const currentUserRef = db.collection('users').doc(currentUserUid);
        const friendToRemoveRef = db.collection('users').doc(friendToRemoveUid);

        const batch = db.batch();

        // Remove each user from the other's lists
        batch.update(currentUserRef, {
             friends: FieldValue.arrayRemove(friendToRemoveUid),
             buddies: FieldValue.arrayRemove(friendToRemoveUid) // Also remove from safety buddy list
        });
        
        batch.update(friendToRemoveRef, {
             friends: FieldValue.arrayRemove(currentUserUid),
             buddies: FieldValue.arrayRemove(currentUserUid) // Also remove from their safety buddy list
        });
        
        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error("Error removing friend:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

/**
 * Sends an alert notification to all of a user's buddies.
 */
export async function sendBuddyAlert(
    userId: string, 
    location: { latitude: number; longitude: number }
): Promise<{success: boolean, error?: string}> {
    if (!userId) return { success: false, error: "User ID is required." };
    
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return { success: false, error: "Sender not found." };
        
        const userData = userDoc.data() as UserProfile;
        const buddies = userData.buddies || [];

        if (buddies.length === 0) {
            return { success: false, error: "You have no buddies in your Alert List." };
        }

        const mapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
        const batch = db.batch();

        buddies.forEach(buddyId => {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: buddyId,
                type: 'buddy_alert',
                fromUserName: userData.name,
                message: `${userData.name} sent a buddy alert. Last known location: ${mapsLink}`,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
            });
        });
        
        await batch.commit();
        
        return { success: true };
    } catch (error: any) {
        console.error("Error sending buddy alert:", error);
        return { success: false, error: 'An unexpected server error occurred while sending alerts.' };
    }
}


export async function updateUserBuddyList(userId: string, friendId: string, isBuddy: boolean): Promise<{success: boolean, error?: string}> {
    if (!userId || !friendId) {
        return { success: false, error: 'User and friend IDs are required.' };
    }
    
    try {
        const userRef = db.collection('users').doc(userId);
        
        if (isBuddy) {
            await userRef.update({
                buddies: FieldValue.arrayUnion(friendId)
            });
        } else {
            await userRef.update({
                buddies: FieldValue.arrayRemove(friendId)
            });
        }
        
        return { success: true };

    } catch (error: any) {
        console.error('Error updating buddy list:', error);
        return { success: false, error: 'A server error occurred.' };
    }
}


/**
 * Creates a pending invitation if one doesn't already exist.
 */
export async function sendInvitation(
    inviterId: string,
    invitedEmail: string
): Promise<{ success: boolean; error?: string }> {
    if (!inviterId || !invitedEmail) {
        return { success: false, error: 'Inviter ID and email are required.' };
    }
    try {
        const invitationsRef = db.collection('invitations');
        const q = invitationsRef
            .where('inviterId', '==', inviterId)
            .where('invitedEmail', '==', invitedEmail.toLowerCase());
        
        const existingInvite = await q.get();
        if (!existingInvite.empty) {
            return { success: true }; // Invitation already exists, no-op
        }

        await invitationsRef.add({
            inviterId: inviterId,
            invitedEmail: invitedEmail.toLowerCase(),
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: any) {
        console.error('Error sending invitation:', error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


/**
 * Fetches pending invitations for a specific user.
 * This query is simplified to avoid needing a composite index. Sorting is handled client-side.
 */
export async function getPendingInvitations(inviterId: string): Promise<Invitation[]> {
    if (!inviterId) {
        return [];
    }
    try {
        const invitationsRef = db.collection('invitations');
        const q = invitationsRef
            .where('inviterId', '==', inviterId)
            .where('status', '==', 'pending');
            
        const snapshot = await q.get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                inviterId: data.inviterId,
                invitedEmail: data.invitedEmail,
                status: data.status,
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
            } as Invitation;
        });

    } catch (error) {
        console.error('Error fetching pending invitations:', error);
        return [];
    }
}
