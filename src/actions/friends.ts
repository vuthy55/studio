
'use server';

import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { BuddyRequest, UserProfile } from '@/lib/types';
import { findUserByEmailAdmin } from '@/lib/firebase-utils';


/**
 * Sends a buddy request from one user to another.
 */
export async function sendBuddyRequest(
    fromUser: { uid: string, name: string, email: string },
    toEmail: string
): Promise<{success: boolean, error?: string}> {
    if (fromUser.email.toLowerCase() === toEmail.toLowerCase()) {
        return { success: false, error: 'You cannot add yourself as a buddy.' };
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
        if (toUserData?.buddyRequests?.some((req: BuddyRequest) => req.fromUid === fromUser.uid)) {
            return { success: false, error: 'You have already sent a request to this user.' };
        }

        const newRequest: BuddyRequest = {
            fromUid: fromUser.uid,
            fromName: fromUser.name,
            fromEmail: fromUser.email,
        };

        // Create notification and add request in one atomic operation
        const batch = db.batch();

        batch.update(toUserRef, {
            buddyRequests: FieldValue.arrayUnion(newRequest)
        });

        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            userId: toUser.id,
            type: 'buddy_request',
            fromUserName: fromUser.name,
            message: `${fromUser.name} wants to add you as a buddy.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        console.error("Error sending buddy request:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}

/**
 * Accepts a buddy request.
 */
export async function acceptBuddyRequest(
    currentUser: { uid: string, name: string },
    request: BuddyRequest
): Promise<{success: boolean, error?: string}> {
     try {
        const currentUserRef = db.collection('users').doc(currentUser.uid);
        const newBuddyRef = db.collection('users').doc(request.fromUid);

        const batch = db.batch();

        // Add each user to the other's buddies list
        batch.update(currentUserRef, {
            friends: FieldValue.arrayUnion(request.fromUid),
            buddyRequests: FieldValue.arrayRemove(request) // Remove the request
        });

        batch.update(newBuddyRef, {
            friends: FieldValue.arrayUnion(currentUser.uid)
        });

        // Send a notification back to the person who sent the request
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
            userId: request.fromUid,
            type: 'buddy_request_accepted', 
            fromUserName: currentUser.name,
            message: `${currentUser.name} accepted your buddy request!`,
            createdAt: FieldValue.serverTimestamp(),
            read: false,
        });


        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        console.error("Error accepting buddy request:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


/**
 * Declines a buddy request.
 */
export async function declineBuddyRequest(
    currentUserUid: string,
    request: BuddyRequest
): Promise<{success: boolean, error?: string}> {
     try {
        const currentUserRef = db.collection('users').doc(currentUserUid);
        await currentUserRef.update({
             buddyRequests: FieldValue.arrayRemove(request)
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error declining buddy request:", error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}

/**
 * Removes a buddy from the user's list. This is a one-way removal.
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

    