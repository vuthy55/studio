
'use server';

import { db, auth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import type { SyncRoom, Participant, RoomMessage, Transcript, SummaryParticipant, RoomSummary } from '@/lib/types';
import { getAppSettingsAction } from './settings';
import { sendRoomEndingSoonEmail } from './email';


/**
 * Fetches all admin user IDs from the 'users' collection.
 * This is a helper function for creating notifications for all admins.
 */
async function getAdminUids(): Promise<string[]> {
    const adminsQuery = db.collection('users').where('role', '==', 'admin');
    const snapshot = await adminsQuery.get();
    if (snapshot.empty) {
        return [];
    }
    return snapshot.docs.map(doc => doc.id);
}

/**
 * Recursively deletes a subcollection.
 */
async function deleteCollection(collectionPath: string, batchSize: number) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(query: FirebaseFirestore.Query, resolve: (value?: unknown) => void) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}

/**
 * Sets the 'firstMessageAt' timestamp on a room document if it doesn't already exist.
 * This action is now idempotent and also resets the room's session state if it had previously ended.
 */
export async function setFirstMessageTimestamp(roomId: string): Promise<{success: boolean, error?: string}> {
    if (!roomId) {
        return { success: false, error: 'Room ID is required.' };
    }
    try {
        const roomRef = db.collection('syncRooms').doc(roomId);
        
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) {
                throw new Error("Room not found.");
            }

            const roomData = roomDoc.data() as SyncRoom;
            
            // Only proceed if the session hasn't officially started yet.
            if (!roomData.firstMessageAt) {
                 const updateData: Record<string, any> = {
                    firstMessageAt: FieldValue.serverTimestamp(),
                    lastSessionEndedAt: FieldValue.delete() // Clear any previous session end time
                };
                transaction.update(roomRef, updateData);
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to set first message timestamp for room ${roomId}:`, error);
        return { success: false, error: 'Failed to update timestamp on the server.' };
    }
}


/**
 * Performs a "soft delete" on a room by setting its status to 'closed'.
 * This is a server action and requires Firebase Admin privileges.
 * This will now also reset the timer state by clearing `firstMessageAt`.
 * @param {string} roomId The ID of the room to close.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating success or failure.
 */
export async function softDeleteRoom(roomId: string): Promise<{success: boolean, error?: string}> {
  if (!roomId) {
    console.error('softDeleteRoom error: No roomId provided.');
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    
    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) {
            throw new Error('Room not found.');
        }
        const roomData = roomDoc.data()!;

        // 1. Update room status and reset timer state
        transaction.update(roomRef, {
            status: 'closed',
            lastActivityAt: FieldValue.serverTimestamp(),
            firstMessageAt: null, // Reset the timer
        });
        
        // 2. Create notifications for all admins
        const adminUids = await getAdminUids();
        if (adminUids.length > 0) {
            for (const adminId of adminUids) {
                const notificationRef = db.collection('notifications').doc();
                transaction.set(notificationRef, {
                    userId: adminId,
                    type: 'room_closed',
                    message: `Room "${roomData.topic}" has been closed.`,
                    createdAt: FieldValue.serverTimestamp(),
                    read: false,
                    roomId: roomId,
                });
            }
        }
    });

    return { success: true };
  } catch (error: any) {
    console.error(`Error closing room ${roomId}:`, error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}

export async function permanentlyDeleteRooms(roomIds: string[]): Promise<{success: boolean, error?: string}> {
  if (!roomIds || roomIds.length === 0) {
    return { success: false, error: "No room IDs provided." };
  }

  try {
    const batch = db.batch();
    for (const roomId of roomIds) {
        const roomRef = db.collection('syncRooms').doc(roomId);
        const roomDoc = await roomRef.get();
        
        // --- Refund Logic ---
        if (roomDoc.exists) {
            const roomData = roomDoc.data() as SyncRoom;
            // A refund is needed if there was a cost AND the room was never started.
            const needsRefund = (roomData.initialCost ?? 0) > 0 && !roomData.firstMessageAt;

            if (needsRefund) {
                const userRef = db.collection('users').doc(roomData.creatorUid);
                
                // 1. Refund tokens to the user
                batch.update(userRef, { tokenBalance: FieldValue.increment(roomData.initialCost!) });

                // 2. Log the refund transaction
                const logRef = userRef.collection('transactionLogs').doc();
                batch.set(logRef, {
                    actionType: 'sync_online_refund',
                    tokenChange: roomData.initialCost,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Refund for canceled room: "${roomData.topic}"`
                });
            }
        }
        // --- End Refund Logic ---

        // Delete subcollections first
        await deleteCollection(`syncRooms/${roomId}/participants`, 50);
        await deleteCollection(`syncRooms/${roomId}/messages`, 50);

        // Then delete the main room document
        batch.delete(roomRef);
    }
    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error("Error deleting rooms:", error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}

export async function updateRoomSummary(roomId: string, summary: RoomSummary): Promise<{success: boolean, error?: string}> {
  if (!roomId || !summary) {
    return { success: false, error: "Room ID and summary are required." };
  }
  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    await roomRef.update({ summary });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating room summary:", error);
    return { success: false, error: `An unexpected server error occurred: ${error.message}` };
  }
}

export async function requestSummaryEditAccess(roomId: string, roomTopic: string, userName: string): Promise<{success: boolean, error?: string}> {
    if (!roomId || !userName) {
        return { success: false, error: 'Room ID and user name are required.' };
    }
    try {
        const adminUids = await getAdminUids();
        const batch = db.batch();
        for (const adminId of adminUids) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: adminId,
                type: 'edit_request',
                message: `${userName} is requesting edit access for the summary of room "${roomTopic}".`,
                createdAt: FieldValue.serverTimestamp(),
                read: false,
                roomId: roomId,
            });
        }
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error requesting edit access:", error);
        return { success: false, error: `An unexpected server error occurred: ${error.message}` };
    }
}


export async function updateScheduledRoom({ roomId, userId, updates, newCost }: { roomId: string, userId: string, updates: Partial<SyncRoom>, newCost: number }): Promise<{success: boolean, error?: string}> {
    if (!roomId) return { success: false, error: 'Room ID is required.' };
    
    const roomRef = db.collection('syncRooms').doc(roomId);
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            const userDoc = await transaction.get(userRef);

            if (!roomDoc.exists) throw new Error('Room not found.');
            if (!userDoc.exists) throw new Error('User not found.');
            
            const roomData = roomDoc.data() as SyncRoom;
            const userData = userDoc.data();
            const originalCost = roomData.initialCost || 0;
            const costDifference = newCost - originalCost;

            if ((userData?.tokenBalance || 0) < costDifference) {
                throw new Error('Insufficient tokens for this update.');
            }
            
            transaction.update(roomRef, {
                ...updates,
                initialCost: newCost,
                lastActivityAt: FieldValue.serverTimestamp()
            });

            if (costDifference !== 0) {
                 transaction.update(userRef, {
                    tokenBalance: FieldValue.increment(-costDifference)
                });
                
                const logRef = userRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'live_sync_online_spend',
                    tokenChange: -costDifference,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Cost adjustment for updating room: "${roomData.topic}"`
                });
            }
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error updating scheduled room:", error);
        return { success: false, error: error.message || 'An unexpected server error occurred.' };
    }
}


export async function setRoomEditability(roomId: string, allowEdits: boolean): Promise<{ success: boolean; error?: string }> {
  if (!roomId) {
    return { success: false, error: 'Room ID is required.' };
  }

  try {
    const roomRef = db.collection('syncRooms').doc(roomId);
    await roomRef.update({ 'summary.allowMoreEdits': allowEdits });
    return { success: true };
  } catch (error: any) {
    console.error(`Error setting editability for room ${roomId}:`, error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}

export async function endAndReconcileRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId) return { success: false, error: 'Room ID is required.' };

    const roomRef = db.collection('syncRooms').doc(roomId);

    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) throw new Error('Room not found.');

            const roomData = roomDoc.data() as SyncRoom;
            
            // If the room was never started, it's a full refund of the initial cost.
            if (!roomData.firstMessageAt) {
                transaction.update(roomRef, { status: 'closed' });
                if (roomData.initialCost && roomData.initialCost > 0) {
                    const creatorRef = db.collection('users').doc(roomData.creatorUid);
                    transaction.update(creatorRef, { tokenBalance: FieldValue.increment(roomData.initialCost) });
                    const logRef = creatorRef.collection('transactionLogs').doc();
                    transaction.set(logRef, {
                        actionType: 'sync_online_refund',
                        tokenChange: roomData.initialCost,
                        timestamp: FieldValue.serverTimestamp(),
                        description: `Refund for unused room: "${roomData.topic}"`
                    });
                }
                return;
            }

            // If the room was started, calculate prorated refund.
            const creatorRef = db.collection('users').doc(roomData.creatorUid);
            const startTime = (roomData.firstMessageAt as Timestamp).toMillis();
            const endTime = Date.now();
            const actualDurationMinutes = Math.ceil((endTime - startTime) / 60000);
            const bookedDurationMinutes = roomData.durationMinutes || 0;
            
            let refundAmount = 0;
            if (actualDurationMinutes < bookedDurationMinutes) {
                const costPerMinute = (roomData.initialCost || 0) / bookedDurationMinutes;
                const minutesToRefund = bookedDurationMinutes - actualDurationMinutes;
                refundAmount = Math.round(minutesToRefund * costPerMinute);
            }
            
            const updates: any = { status: 'closed' };
            if (refundAmount > 0) {
                 updates['summary.refundAmount'] = refundAmount; // Optional: Log refund in summary
            }
            transaction.update(roomRef, updates);

            if (refundAmount > 0) {
                transaction.update(creatorRef, { tokenBalance: FieldValue.increment(refundAmount) });
                
                const logRef = creatorRef.collection('transactionLogs').doc();
                transaction.set(logRef, {
                    actionType: 'sync_online_refund',
                    tokenChange: refundAmount,
                    timestamp: FieldValue.serverTimestamp(),
                    description: `Refund for unused time in room: "${roomData.topic}"`
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error(`Error reconciling room ${roomId}:`, error);
        return { success: false, error: 'An unexpected server error occurred.' };
    }
}


/**
 * Handles all logic when a participant exits a room, including emcee reassignment and room closure.
 * This is an atomic fire-and-forget action called by the client.
 */
export async function handleParticipantExit(roomId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room ID and User ID are required.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) return; // Room already gone
            const roomData = roomDoc.data() as SyncRoom;
            
            // --- Idempotency Check ---
            // If the room is already closed, do nothing to prevent multiple refunds.
            if (roomData.status === 'closed') {
                return;
            }

            const participantRef = roomRef.collection('participants').doc(userId);
            const participantDoc = await transaction.get(participantRef);
            if (!participantDoc.exists) return; // Participant already gone
            const participantData = participantDoc.data() as Participant;

            // Delete the leaving participant
            transaction.delete(participantRef);

            // Get all remaining participants within the same transaction
            const allParticipantsSnapshot = await transaction.get(roomRef.collection('participants'));
            
            // Filter out the currently exiting participant to get the "true" remaining count
            const remainingParticipants = allParticipantsSnapshot.docs.filter(doc => doc.id !== userId);

            // Check if the room is now empty
            if (remainingParticipants.length === 0) {
                // By calling this here, inside the transaction, we ensure it only runs ONCE.
                // The `endAndReconcileRoom` function itself has its own transaction,
                // but this outer transaction ensures we don't even attempt to call it multiple times.
                await endAndReconcileRoom(roomId);
                return; // Reconciliation handles closing the room, so we can stop here.
            }

            // If the room is not empty, check if an emcee left
            const wasEmcee = roomData.emceeEmails.includes(participantData.email);
            if (wasEmcee) {
                const remainingEmcees = roomData.emceeEmails.filter(email => email !== participantData.email);

                if (remainingEmcees.length === 0) {
                    // Last emcee left, promote the first person from the remaining list
                    const newEmcee = remainingParticipants[0].data() as Participant;
                    transaction.update(roomRef, {
                        emceeEmails: FieldValue.arrayUnion(newEmcee.email)
                    });
                    
                    // Note: We cannot create notifications inside this user-exit transaction
                    // because it might conflict with other writes. Notifications are non-critical
                    // and can be handled separately if needed, or by a different mechanism.
                } else {
                    // Other emcees remain, just remove the leaving one
                     transaction.update(roomRef, {
                        emceeEmails: FieldValue.arrayRemove(participantData.email)
                    });
                }
            }
        });
        return { success: true };

    } catch (error: any) {
        console.error(`Error handling participant exit for user ${userId} in room ${roomId}:`, error);
        // We don't return an error to the client as this is fire-and-forget
        return { success: false, error: 'Server-side exit handling failed.' };
    }
}

/**
 * Handles sending an in-session reminder to all participants, including a special email to the creator.
 * This is an idempotent action.
 */
export async function handleMeetingReminder(roomId: string, creatorId: string): Promise<{ success: boolean; error?: string }> {
  if (!roomId || !creatorId) {
    return { success: false, error: 'Room and Creator IDs are required.' };
  }

  const roomRef = db.collection('syncRooms').doc(roomId);

  try {
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) throw new Error('Room not found.');
    const roomData = roomDoc.data() as SyncRoom;

    // Idempotency check
    if (roomData.endingReminderSent) {
      console.log(`[Reminder] Reminder already sent for room ${roomId}.`);
      return { success: true };
    }

    const [participantsSnapshot, settings, creatorDoc] = await Promise.all([
      roomRef.collection('participants').get(),
      getAppSettingsAction(),
      db.collection('users').doc(creatorId).get()
    ]);
    
    const creatorData = creatorDoc.data();
    if (!creatorData) throw new Error(`Creator with ID ${creatorId} not found.`);

    const minutesRemaining = roomData.reminderMinutes || 5;

    const batch = db.batch();
    
    // In-Chat System Message
    const messageRef = roomRef.collection('messages').doc();
    batch.set(messageRef, {
        speakerUid: 'system',
        speakerName: 'VibeSync Bot',
        type: 'reminder',
        text: `This meeting is scheduled to end in ${minutesRemaining} minutes. Anyone can click to pay to continue.`,
        createdAt: FieldValue.serverTimestamp(),
        actions: ['payToContinue'],
    });

    // Mark that the reminder has been sent
    batch.update(roomRef, { endingReminderSent: true });
    
    await batch.commit();
    
    return { success: true };
  } catch (error: any) {
    console.error(`Error sending reminder for room ${roomId}:`, error);
    return { success: false, error: 'Failed to send meeting reminder.' };
  }
}
      
/**
 * Allows a user to volunteer to pay for a meeting's overtime.
 * This action is transactional to prevent race conditions.
 */
export async function volunteerAsPayor(roomId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!roomId || !userId) {
        return { success: false, error: 'Room and User IDs are required.' };
    }

    const roomRef = db.collection('syncRooms').doc(roomId);
    const userRef = db.collection('users').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const [roomDoc, userDoc, participantsSnapshot, settings] = await Promise.all([
                transaction.get(roomRef),
                transaction.get(userRef),
                transaction.get(roomRef.collection('participants')),
                getAppSettingsAction() // This is read-only, safe to get outside transaction
            ]);

            if (!roomDoc.exists) throw new Error('Room not found.');
            if (!userDoc.exists) throw new Error('User not found.');

            const roomData = roomDoc.data() as SyncRoom;
            const userData = userDoc.data()!;

            // --- Prevent Race Condition ---
            // If another user just became the payor, the endingReminderSent flag would be reset to false
            // by the time this transaction runs. This check ensures we only act on the *first* volunteer for a cycle.
            if (!roomData.endingReminderSent) {
                console.log(`[Payor] Race condition prevented. Room ${roomId} already has a volunteer for this cycle.`);
                return; 
            }
            
            const participantCount = participantsSnapshot.size;
            const costPerMinute = settings.costPerSyncOnlineMinute || 1;
            const burnRate = participantCount * costPerMinute;

            const userBalance = userData.tokenBalance || 0;
            const extraMinutes = burnRate > 0 ? Math.floor(userBalance / burnRate) : 0;
            
            if (extraMinutes <= 0) {
                // User has no tokens to contribute, don't change anything.
                // A system message could be sent, but for now we fail silently.
                return;
            }

            const now = Date.now();
            const currentEffectiveEnd = roomData.effectiveEndTime ? (roomData.effectiveEndTime as Timestamp).toMillis() : now;
            const newEffectiveEndTime = new Date(currentEffectiveEnd + (extraMinutes * 60 * 1000));
            
            transaction.update(roomRef, {
                currentPayorId: userId,
                effectiveEndTime: newEffectiveEndTime,
                endingReminderSent: false // Reset the reminder flag for the next cycle
            });
            
             const messageRef = roomRef.collection('messages').doc();
             transaction.set(messageRef, {
                speakerUid: 'system',
                speakerName: 'VibeSync Bot',
                type: 'system',
                text: `${userData.name} has extended the meeting by ${extraMinutes} minutes!`,
                createdAt: FieldValue.serverTimestamp(),
            });

        });
        return { success: true };
    } catch (error: any) {
        console.error(`[Payor] Error volunteering for room ${roomId}:`, error);
        return { success: false, error: error.message || 'Could not volunteer to pay.' };
    }
}
    
```
  <change>
    <file>/src/app/sync-room/[roomId]/page.tsx</file>
    <content><![CDATA[
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, collection, query, orderBy, serverTimestamp, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch, where, Timestamp, getDoc } from 'firebase/firestore';

import type { SyncRoom, Participant, BlockedUser, RoomMessage } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel, mapAzureCodeToLanguageCode } from '@/lib/azure-languages';
import { recognizeFromMic, abortRecognition } from '@/services/speech';
import { translateText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/services/tts';
import { setFirstMessageTimestamp, handleParticipantExit, endAndReconcileRoom, handleMeetingReminder, volunteerAsPayor } from '@/actions/room';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import { sendRoomInviteEmail } from '@/actions/email';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Mic, Users, Send, User, Languages, LogIn, XCircle, Crown, LogOut, ShieldX, UserCheck, UserX as RemoveUserIcon, ShieldQuestion, MicOff, ShieldCheck, UserPlus, Coins, Clock, Info, Trash2, Save } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from '@/components/ui/textarea';
import useLocalStorage from '@/hooks/use-local-storage';
import { useUserData } from '@/context/UserDataContext';
import { Badge } from '@/components/ui/badge';


function SetupScreen({ user, room, roomId, onJoinSuccess }: { user: any; room: SyncRoom; roomId: string; onJoinSuccess: (joinTime: Timestamp) => void; }) {
    const router = useRouter();
    const [name, setName] = useState(user.displayName || user.email?.split('@')[0] || 'Participant');
    const [language, setLanguage] = useLocalStorage<AzureLanguageCode | ''>('preferredSpokenLanguage', '');
    const [isJoining, setIsJoining] = useState(false);
    const { toast } = useToast();

    const handleJoin = async () => {
        if (!name || !language) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please enter your name and select a language.' });
            return;
        }
        setIsJoining(true);
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            const joinTime = Timestamp.now();
            const participantData: Participant = {
                uid: user.uid,
                name: name,
                email: user.email!,
                selectedLanguage: language,
                isMuted: false,
                joinedAt: joinTime
            };
            await setDoc(participantRef, participantData);
            onJoinSuccess(joinTime);
        } catch (error) {
            console.error("Error joining room:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not join the room.' });
        } finally {
            setIsJoining(false);
        }
    };
    
    const handleCancel = () => {
        router.push('/synchub?tab=sync-online');
    }

    return (        
        <div className="flex items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Join Room: {room.topic}</CardTitle>
                    <CardDescription>Set up your details for this meeting.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Your Name</Label>
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="language">Your Spoken Language</Label>
                        <Select onValueChange={(v) => setLanguage(v as AzureLanguageCode)} value={language}>
                            <SelectTrigger id="language">
                                <SelectValue placeholder="Select your language..." />
                            </SelectTrigger>
                            <SelectContent>
                                <ScrollArea className="h-72">
                                    {azureLanguages.map(lang => (
                                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                    ))}
                                </ScrollArea>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
                    <Button onClick={handleJoin} disabled={isJoining}>
                        {isJoining ? <LoaderCircle className="animate-spin" /> : <LogIn className="mr-2" />}
                        Join Room
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


function ParticipantsPanel({ 
    roomData,
    isCurrentUserEmcee,
    isInviteDialogOpen,
    setIsInviteDialogOpen,
    emailsToInvite,
    setEmailsToInvite,
    isSendingInvites,
    handleSendInvites,
    presentParticipants,
    absentParticipantEmails,
    user,
    isListening,
    isRoomCreator,
    handleMuteToggle,
    handlePromoteToEmcee,
    handleDemoteEmcee,
    handleRemoveParticipant,
    handleManualExit,
    handleEndMeeting,
    sessionTimer,
    timerTooltipContent
}: any) {
    
    return (
        <div className="flex flex-col h-full bg-background">
            <header className="p-4 border-b space-y-2">
                <div className="bg-primary/10 p-3 rounded-lg flex justify-between items-center">
                    <div>
                         <p className="text-sm text-primary/80">Room Creator</p>
                        <p className="font-bold text-lg text-primary flex items-center gap-1.5">
                            <Crown className="h-4 w-4" />
                            {roomData.creatorName}
                        </p>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                 <div className="font-mono text-lg text-primary font-semibold flex items-center gap-2 cursor-help">
                                    <Clock className="h-5 w-5" />
                                    {sessionTimer}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {timerTooltipContent}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                 <div className="flex items-center justify-between pt-2">
                     <h2 className="text-lg font-semibold flex items-center gap-2"><Users /> Participants</h2>
                    {isCurrentUserEmcee && (
                        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm"><UserPlus className="mr-2 h-4 w-4"/> Invite</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Invite More People</DialogTitle>
                                    <DialogDescription>
                                        Enter email addresses separated by commas to invite them to this room.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-2">
                                    <Label htmlFor="emails-to-invite">Emails</Label>
                                    <Textarea 
                                        id="emails-to-invite" 
                                        value={emailsToInvite}
                                        onChange={(e) => setEmailsToInvite(e.target.value)}
                                        placeholder="friend1@example.com, friend2@example.com"
                                    />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                                    <Button onClick={handleSendInvites} disabled={isSendingInvites}>
                                        {isSendingInvites && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                        Send Invites
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                 </div>
            </header>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                     <h3 className="font-semibold text-sm flex items-center gap-2 text-green-600"><UserCheck/> Present ({presentParticipants.length})</h3>
                    {presentParticipants.map((p: Participant) => {
                        const isCurrentUser = p.uid === user?.uid;
                        const isEmcee = roomData?.emceeEmails?.includes(p.email);
                        const isCreator = isRoomCreator(p.uid);
                        const canBeModified = isCurrentUserEmcee && !isCreator && !isCurrentUser;
                         const canBeDemoted = isCurrentUserEmcee && !isCreator && isEmcee;

                        return (
                            <div key={p.uid} className="flex items-center gap-3 group p-2 rounded-md hover:bg-muted/50">
                                <Avatar>
                                    <AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden">
                                    <p className="font-semibold truncate flex items-center gap-1.5">
                                        {isEmcee && <Crown className="h-4 w-4 text-amber-400"/>}
                                        {p.name} {isCurrentUser && '(You)'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{getAzureLanguageLabel(p.selectedLanguage)}</p>
                                </div>
                                
                                 {p.isMuted && <MicOff className="h-4 w-4 text-red-500"/>}
                                {isListening && isCurrentUser && <Mic className="h-4 w-4 text-green-500 animate-pulse" />}

                                {canBeModified && (
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <TooltipProvider>
                                            {!isEmcee ? (
                                                 <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePromoteToEmcee(p.email)}>
                                                            <ShieldCheck className="h-4 w-4 text-green-600" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Promote to Emcee</p></TooltipContent>
                                                </Tooltip>
                                            ) : canBeDemoted && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDemoteEmcee(p.email)}>
                                                            <ShieldX className="h-4 w-4 text-muted-foreground" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Demote Emcee</p></TooltipContent>
                                                </Tooltip>
                                            )}
                                           
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMuteToggle(p.uid, !!p.isMuted)}>
                                                        <MicOff className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>{p.isMuted ? 'Unmute' : 'Mute'} Participant</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <AlertDialog>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <AlertDialogTrigger asChild>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                                                <RemoveUserIcon className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                    </AlertDialogTrigger>
                                                    <TooltipContent><p>Remove Participant</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove {p.name}?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently remove and block {p.name} from the room. They will not be able to rejoin.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleRemoveParticipant(p as Participant)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                        Remove &amp; Block
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                )}

                            </div>
                        );
                    })}
                </div>
                {absentParticipantEmails.length > 0 && (
                    <div className="p-4 space-y-2">
                         <Separator />
                         <h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground pt-2"><RemoveUserIcon/> Invited ({absentParticipantEmails.length})</h3>
                        {absentParticipantEmails.map((email: string) => (
                            <div key={email} className="flex items-center gap-3 p-1 rounded-md opacity-60">
                                <Avatar>
                                    <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                 <div className="flex-1 overflow-hidden">
                                     <p className="font-semibold truncate flex items-center gap-1.5">{email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
             <footer className="p-4 border-t flex flex-col gap-4">
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button variant="outline" size="sm" className="w-full">
                                <LogOut className="mr-2 h-4 w-4"/>
                                Exit Room
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure you want to exit?</AlertDialogTitle>
                                <AlertDialogDescription>
                                You can rejoin this room later as long as it is still active.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Stay</AlertDialogCancel>
                                <AlertDialogAction onClick={handleManualExit}>Exit</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {isCurrentUserEmcee && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="w-full">
                                    <ShieldX className="mr-2 h-4 w-4"/>
                                    End Meeting
                                </Button>
                            </DialogTrigger>
                             <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>End Meeting for All?</DialogTitle>
                                    <DialogDescription>
                                        Choose how you would like to end this meeting for all participants.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="sm:justify-end gap-2 pt-4">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DialogClose asChild>
                                                    <Button type="button" variant="ghost">Cancel</Button>
                                                </DialogClose>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Return to the room.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button type="button" variant="destructive" onClick={handleEndMeeting}>
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    End &amp; Delete
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>End the meeting and close the room permanently.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </footer>
        </div>
    );
}

export default function SyncRoomPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const roomId = params.roomId as string;
    const { userProfile, settings, handleSyncOnlineSessionEnd } = useUserData();

    const [user, authLoading] = useAuthState(auth);
    
    const [roomData, roomLoading, roomError] = useDocumentData(doc(db, 'syncRooms', roomId));
    const [participants, setParticipants] = useState<Participant[]>([]);
    
    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
    
    const [isParticipant, setIsParticipant] = useState<'unknown' | 'yes' | 'no'>('unknown');

    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [emailsToInvite, setEmailsToInvite] = useState('');
    const [isSendingInvites, setIsSendingInvites] = useState(false);
    
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const processedMessages = useRef(new Set<string>());
    
    const sessionUsageRef = useRef<number>(0);
    const [sessionTimer, setSessionTimer] = useState('00:00');
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reminderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    
    const isExiting = useRef(false);
    const participantListenerUnsubscribe = useRef<(() => void) | null>(null);
    const messageListenerUnsubscribe = useRef<(() => void) | null>(null);

    const handleManualExit = useCallback(async () => {
        if (!user || isExiting.current) return;
        isExiting.current = true;
        
        participantListenerUnsubscribe.current?.();
        messageListenerUnsubscribe.current?.();
        
        await handleParticipantExit(roomId, user.uid);
        
        const sessionDurationMs = sessionUsageRef.current;
        if (sessionDurationMs > 0) {
            handleSyncOnlineSessionEnd(sessionDurationMs);
        }

        router.push('/synchub?tab=sync-online');
    }, [user, roomId, router, handleSyncOnlineSessionEnd]);

    // This hook now only handles the visual session timer, and runs for everyone.
    useEffect(() => {
        if (roomData?.firstMessageAt) {
            const startTime = (roomData.firstMessageAt as Timestamp).toDate().getTime();

            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

            timerIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const elapsedMs = now - startTime;
                sessionUsageRef.current = elapsedMs;

                const totalSeconds = Math.floor(elapsedMs / 1000);
                const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const seconds = (totalSeconds % 60).toString().padStart(2, '0');
                setSessionTimer(`${minutes}:${seconds}`);
            }, 1000);
            
            return () => {
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            };
        }
    }, [roomData?.firstMessageAt]);

    // Centralized, dynamic reminder logic
    useEffect(() => {
        if (!roomData || !user || !participants.length || roomData.status !== 'active' || roomData.endingReminderSent) {
            return;
        }

        // 1. Deterministically find the trigger participant.
        const activeParticipants = [...participants].sort((a, b) => a.uid.localeCompare(b.uid));
        if (activeParticipants.length === 0) return;

        const triggerParticipantId = activeParticipants[0].uid;
        const amITrigger = user.uid === triggerParticipantId;

        // 2. Logic to set or clear the timer
        const startReminderTimer = () => {
            if (roomData.firstMessageAt && roomData.durationMinutes && roomData.reminderMinutes) {
                const scheduledEnd = (roomData.firstMessageAt as Timestamp).toMillis() + (roomData.durationMinutes * 60 * 1000);
                const reminderTime = scheduledEnd - (roomData.reminderMinutes * 60 * 1000);
                const timeoutDuration = reminderTime - Date.now();
                
                if (reminderTimeoutRef.current) clearTimeout(reminderTimeoutRef.current);

                if (timeoutDuration > 0) {
                    reminderTimeoutRef.current = setTimeout(() => {
                        handleMeetingReminder(roomId, roomData.creatorUid);
                    }, timeoutDuration);
                }
            }
        };

        if (amITrigger) {
            startReminderTimer();
        } else {
            if (reminderTimeoutRef.current) {
                clearTimeout(reminderTimeoutRef.current);
                reminderTimeoutRef.current = null;
            }
        }
        
        return () => {
            if (reminderTimeoutRef.current) clearTimeout(reminderTimeoutRef.current);
        };

    }, [participants, roomData, user]);

    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    const { presentParticipants, absentParticipantEmails } = useMemo(() => {
        if (!roomData || !participants) {
            return { presentParticipants: [], absentParticipantEmails: [] };
        }
        const presentUids = new Set(participants.map(p => p.uid));
        const absent = roomData.invitedEmails.filter((email: string) => {
             return !participants.some(p => p.email === email);
        });
        
        return { presentParticipants: participants, absentParticipantEmails: absent };

    }, [roomData, participants]);

    const currentUserParticipant = useMemo(() => {
        if (!user || !participants) return undefined;
        return participants.find(p => p.uid === user.uid);
    }, [participants, user]);

    const isCurrentUserEmcee = useMemo(() => {
        if (!user || !roomData) return false;
        return roomData.creatorUid === user.uid || (user.email && roomData.emceeEmails?.includes(user.email));
    }, [user, roomData]);
    
     const timerTooltipContent = useMemo(() => {
        return (
            <div className="p-2 space-y-2 text-sm max-w-xs">
                <p className="font-bold">Session Billing</p>
                <p>The timer reflects active conversation time, which starts on the first mic press.</p>
                 <p className="text-xs text-muted-foreground pt-2 border-t">
                    Your initial room cost has been deducted. At the end of the session, the actual usage cost will be reconciled against the pre-paid amount. Any difference may be refunded or charged.
                </p>
            </div>
        );
    }, []);
    
    const isRoomCreator = useCallback((uid: string) => {
        return uid === roomData?.creatorUid;
    }, [roomData]);
    
    const checkParticipationAndInitialize = useCallback(async (joinTimestamp: Timestamp) => {
        if (!user || !roomData) return;

        setIsParticipant('yes');
        
        if (messageListenerUnsubscribe.current) messageListenerUnsubscribe.current();
        
        const messagesQuery = query(
            collection(db, 'syncRooms', roomId, 'messages'),
            orderBy("createdAt"),
            where("createdAt", ">=", joinTimestamp) 
        );
        
        messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (snapshot) => {
            const newMessages: RoomMessage[] = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    newMessages.push({ id: change.doc.id, ...change.doc.data() } as RoomMessage);
                }
            });

            if (newMessages.length > 0) {
                setMessages(prev => {
                    const all = [...prev, ...newMessages];
                    const uniqueMessages = Array.from(new Map(all.map(item => [item.id, item])).values());
                    return uniqueMessages.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
                });
            }
            setMessagesLoading(false);
        });

    }, [user, roomData, roomId]);
    

    useEffect(() => {
        if (authLoading || roomLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const checkInitialParticipation = async () => {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', user.uid);
            const participantDoc = await getDoc(participantRef);

            if (participantDoc.exists()) {
                checkParticipationAndInitialize(participantDoc.data()?.joinedAt || Timestamp.now());
            } else {
                setIsParticipant('no');
            }
        };
        
        checkInitialParticipation();
        
        if (participantListenerUnsubscribe.current) participantListenerUnsubscribe.current();
        const participantsQuery = query(collection(db, 'syncRooms', roomId, 'participants'));
        participantListenerUnsubscribe.current = onSnapshot(participantsQuery, (snapshot) => {
            const parts = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as Participant);
            setParticipants(parts);
        });

        return () => {
            participantListenerUnsubscribe.current?.();
            messageListenerUnsubscribe.current?.();
        };
    }, [user, authLoading, roomData, roomLoading, router, roomId, checkParticipationAndInitialize]);
    
    
    useEffect(() => {
        if (!user || isParticipant !== 'yes' || isExiting.current) return;

        const amIStillHere = participants.some(p => p.uid === user.uid);
        
        if (!amIStillHere) {
            toast({
                variant: 'destructive',
                title: 'You were removed',
                description: 'An emcee has removed you from the room.',
                duration: 5000,
            });
            handleManualExit();
        }
    }, [participants, isParticipant, user, toast, handleManualExit]);

    useEffect(() => {
        if (!roomData || !user || isExiting.current) return;

        if (roomData.status === 'closed') {
            if (!isExiting.current) {
                toast({
                    title: 'Meeting Ended',
                    description: 'This room has been closed by the emcee.',
                    duration: 5000,
                });
                handleManualExit();
            }
        }
        if (roomData.blockedUsers?.some((bu: BlockedUser) => bu.uid === user.uid)) {
            toast({
                variant: 'destructive',
                title: 'Access Denied',
                description: 'You have been blocked from this room.',
                duration: 5000
            });
            handleManualExit();
        }
    }, [roomData, user, toast, handleManualExit]);

    useEffect(() => {
        if (!messages.length || !user || !currentUserParticipant?.selectedLanguage) return;

        const processMessage = async (msg: RoomMessage) => {
            if (msg.speakerUid === user.uid || processedMessages.current.has(msg.id)) {
                return;
            }
            
             // Skip processing for system messages that aren't reminders with actions
            if (msg.speakerUid === 'system' && !msg.actions?.includes('payToContinue')) {
                processedMessages.current.add(msg.id);
                return;
            }

            processedMessages.current.add(msg.id);
            
            try {
                setIsSpeaking(true);
                
                const fromLangLabel = msg.speakerLanguage ? getAzureLanguageLabel(msg.speakerLanguage) : 'English';
                const toLangLabel = getAzureLanguageLabel(currentUserParticipant.selectedLanguage!);
                
                const translated = await translateText({
                    text: msg.text,
                    fromLanguage: fromLangLabel,
                    toLanguage: toLangLabel,
                });

                setTranslatedMessages(prev => ({...prev, [msg.id]: translated.translatedText}));
                
                const { audioDataUri } = await generateSpeech({ 
                    text: translated.translatedText, 
                    lang: currentUserParticipant.selectedLanguage!,
                });
                
                if (audioPlayerRef.current) {
                    audioPlayerRef.current.src = audioDataUri;
                    await audioPlayerRef.current.play();
                    await new Promise(resolve => audioPlayerRef.current!.onended = resolve);
                }
            } catch(e: any) {
                console.error("Error processing message:", e);
                toast({ variant: 'destructive', title: 'Playback Error', description: `Could not play audio for a message.`});
            } finally {
                setIsSpeaking(false);
            }
        };
        
        const playQueue = async () => {
             for (const msg of messages) {
                if (!processedMessages.current.has(msg.id)) {
                    await processMessage(msg);
                }
            }
        };
        
        playQueue();

    }, [messages, user, currentUserParticipant, toast]);


    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);
    

    const handleEndMeeting = async () => {
        if (!isCurrentUserEmcee) {
             return;
        }
        try {
            
            const result = await endAndReconcileRoom(roomId);
            if (result.success) {
                // The room status change will trigger the exit for all participants
            } else {
                 toast({ variant: 'destructive', title: 'Error', description: result.error || 'Could not end the meeting.' });
            }
        } catch (error) {
            console.error("Error ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not end the meeting.' });
        }
    };
    
    const handleSaveAndEndMeeting = async () => {
        if (!isCurrentUserEmcee) return;
        setIsSummarizing(true);
        toast({ title: 'Summarizing...', description: 'The AI is generating a meeting summary. This may take a moment.' });
        try {
            await summarizeRoom({ roomId });
            toast({ title: 'Summary Saved!', description: 'The meeting has ended and the summary is available.' });
            // The summarizeRoom action closes the room, which will trigger the exit.
        } catch (error) {
            console.error("Error saving and ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save the summary and end the meeting.' });
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleSendInvites = async () => {
        if (!user || !roomData) return;
        const emails = emailsToInvite.split(/[ ,]+/).map(e => e.trim()).filter(Boolean);
        if (emails.length === 0) {
            toast({ variant: 'destructive', title: 'No Emails', description: 'Please enter at least one email address.' });
            return;
        }

        setIsSendingInvites(true);
        try {
            await updateDoc(doc(db, 'syncRooms', roomId), {
                invitedEmails: arrayUnion(...emails)
            });
            
            const scheduledAtDate = roomData.scheduledAt
                ? (roomData.scheduledAt instanceof Timestamp ? roomData.scheduledAt.toDate() : new Date(roomData.scheduledAt))
                : new Date();

            await sendRoomInviteEmail({
                to: emails,
                roomTopic: roomData.topic,
                creatorName: user.displayName || 'A user',
                scheduledAt: scheduledAtDate,
                joinUrl: `${window.location.origin}/join/${roomId}?ref=${roomData.creatorUid}`
            });

            toast({ title: 'Invites Sent', description: 'The new participants have been notified by email.' });
            setEmailsToInvite('');
            setIsInviteDialogOpen(false);
        } catch (error) {
            console.error('Error sending invites:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not send invitations.' });
        } finally {
            setIsSendingInvites(false);
        }
    };

    const handleMicPress = async () => {
        if (!currentUserParticipant?.selectedLanguage || currentUserParticipant?.isMuted || !user) return;

        if (roomData && !roomData.firstMessageAt) {
            await setFirstMessageTimestamp(roomId);
        }

        setIsListening(true);
        try {
            const recognizedText = await recognizeFromMic(currentUserParticipant.selectedLanguage);
            
            if (recognizedText) {
                await addDoc(collection(db, 'syncRooms', roomId, 'messages'), {
                    text: recognizedText,
                    speakerName: currentUserParticipant.name,
                    speakerUid: currentUserParticipant.uid,
                    speakerLanguage: currentUserParticipant.selectedLanguage,
                    createdAt: serverTimestamp(),
                });
            }
        } catch (error: any) {
             if (error.message !== "Recognition was aborted.") {
               toast({ variant: 'destructive', title: 'Recognition Failed', description: error.message });
            }
        } finally {
            setIsListening(false);
        }
    }
    
    const handleMuteToggle = async (participantId: string, currentMuteStatus: boolean) => {
        if (!isCurrentUserEmcee) return;
        try {
            const participantRef = doc(db, 'syncRooms', roomId, 'participants', participantId);
            await updateDoc(participantRef, { isMuted: !currentMuteStatus });
            toast({ title: `User ${currentMuteStatus ? 'Unmuted' : 'Muted'}`, description: `The participant's microphone status has been updated.` });
        } catch (error) {
            console.error("Error toggling mute:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not update mute status.' });
        }
    };

    const handleRemoveParticipant = async (participant: Participant) => {
        if (!isCurrentUserEmcee) return;
        try {
            const batch = writeBatch(db);
            const userToBlock: BlockedUser = { uid: participant.uid, email: participant.email };

            batch.update(doc(db, 'syncRooms', roomId), {
                blockedUsers: arrayUnion(userToBlock)
            });

            const participantRef = doc(db, 'syncRooms', roomId, 'participants', participant.uid);
            batch.delete(participantRef);
            
            await batch.commit();

            toast({ title: 'User Removed & Blocked', description: `${participant.name} has been removed from the room and cannot re-enter.` });
        } catch (error) {
            console.error("Error removing participant:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not remove the participant.' });
        }
    };

    const handlePromoteToEmcee = async (participantEmail: string) => {
        if (!isCurrentUserEmcee) return;
        try {
            await updateDoc(doc(db, 'syncRooms', roomId), {
                emceeEmails: arrayUnion(participantEmail)
            });
            toast({ title: 'Promotion Success', description: `${participantEmail} is now an emcee.` });
        } catch (error) {
            console.error("Error promoting emcee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not promote participant.' });
        }
    };

    const handleDemoteEmcee = async (participantEmail: string) => {
        if (!isCurrentUserEmcee) return;
        try {
            await updateDoc(doc(db, 'syncRooms', roomId), {
                emceeEmails: arrayRemove(participantEmail)
            });
            toast({ title: 'Demotion Success', description: `${participantEmail} is no longer an emcee.` });
        } catch (error) {
            console.error("Error demoting emcee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not demote emcee.' });
        }
    };

    const handlePayToContinue = async () => {
        if (!user || isPaying) return;
        setIsPaying(true);
        const result = await volunteerAsPayor(roomId, user.uid);
        if (!result.success) {
            toast({
                variant: 'destructive',
                title: 'Could not extend meeting',
                description: result.error || 'Please ensure you have enough tokens.'
            });
        }
        setIsPaying(false);
    };


    if (authLoading || roomLoading || isParticipant === 'unknown' || isSummarizing) {
        return <div className="flex h-screen items-center justify-center flex-col gap-4">
            <LoaderCircle className="h-10 w-10 animate-spin" />
            {isSummarizing && <p className="text-lg text-muted-foreground">AI is summarizing, please wait...</p>}
            </div>;
    }

    if (roomError) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load room data.' });
        router.push('/synchub?tab=sync-online');
        return null;
    }

    if (!roomData) {
        return <div className="flex h-screen items-center justify-center"><p>Room not found.</p></div>;
    }
    
    if (user && isParticipant === 'no') {
        return <SetupScreen user={user} room={roomData as SyncRoom} roomId={roomId} onJoinSuccess={(joinTime) => checkParticipationAndInitialize(joinTime)} />;
    }

    const participantsPanelProps = {
        roomData,
        isCurrentUserEmcee,
        isInviteDialogOpen,
        setIsInviteDialogOpen,
        emailsToInvite,
        setEmailsToInvite,
        isSendingInvites,
        handleSendInvites,
        presentParticipants,
        absentParticipantEmails,
        user,
        isListening,
        isRoomCreator,
        handleMuteToggle,
        handlePromoteToEmcee,
        handleDemoteEmcee,
        handleRemoveParticipant,
        handleManualExit,
        handleEndMeeting,
        sessionTimer,
        timerTooltipContent
    };

    return (
        <div className="flex h-screen bg-muted/40">
            <aside className="hidden md:flex md:w-1/3 min-w-[320px] max-w-sm border-r">
                <ParticipantsPanel {...participantsPanelProps} />
            </aside>

            <main className="flex-1 flex flex-col">
                 <header className="p-4 border-b bg-background flex justify-between items-center gap-4">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="icon" className="md:hidden">
                                <Users className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-80">
                           <SheetHeader className="sr-only"><SheetTitle>Participants Panel</SheetTitle><SheetDescription>View and manage room participants.</SheetDescription></SheetHeader>
                            <ParticipantsPanel {...participantsPanelProps} />
                        </SheetContent>
                    </Sheet>

                    <div className="flex-grow text-center">
                        <h1 className="text-xl font-semibold">{roomData.topic}</h1>
                    </div>
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden">
                                <LogOut />
                                <span className="sr-only">Exit</span>
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to exit?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You can rejoin this room later as long as it is still active.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Stay</AlertDialogCancel>
                            <AlertDialogAction onClick={handleManualExit}>Exit</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </header>

                <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                     <ScrollArea className="flex-grow pr-4 -mr-4">
                        <div className="space-y-4">
                            {messages.map((msg) => {
                                const isOwnMessage = msg.speakerUid === user?.uid;
                                let displayText: React.ReactNode = isOwnMessage ? msg.text : (translatedMessages[msg.id] || `Translating from ${getAzureLanguageLabel(msg.speakerLanguage || '')}...`);
                                
                                if (msg.type === 'reminder') {
                                    return (
                                        <div key={msg.id} className="p-3 my-2 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm">
                                            <div className="flex items-center gap-3">
                                                <Info className="h-5 w-5" />
                                                <div className="flex-grow">
                                                    <p>{msg.text}</p>
                                                    {msg.actions?.includes('payToContinue') && (
                                                        <Button size="sm" className="mt-2" onClick={handlePayToContinue} disabled={isPaying}>
                                                            {isPaying ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Coins className="mr-2 h-4 w-4" />}
                                                            Pay to Continue
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }

                                return (
                                    <div key={msg.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                        {!isOwnMessage && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback>{msg.speakerName.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                                            {!isOwnMessage && <p className="text-xs font-bold mb-1">{msg.speakerName}</p>}
                                            <p>{displayText}</p>
                                            <p className="text-xs opacity-70 mt-1 text-right">{msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                             <div ref={messagesEndRef} />
                        </div>
                         {messagesLoading && isParticipant === 'yes' && <LoaderCircle className="mx-auto my-4 h-6 w-6 animate-spin" />}
                         {!messagesLoading && messages?.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <p>No messages yet. Be the first to speak!</p>
                            </div>
                         )}
                    </ScrollArea>
                </div>
                <div className="p-4 border-t bg-background flex flex-col gap-4">
                    <div className="flex flex-col items-center justify-center gap-4">
                       <Button 
                            size="lg" 
                            className={cn("rounded-full w-24 h-24 text-lg", isListening && "bg-destructive hover:bg-destructive/90")}
                            onClick={handleMicPress}
                            disabled={isSpeaking || currentUserParticipant?.isMuted}
                            title={currentUserParticipant?.isMuted ? 'You are muted' : 'Press to talk'}
                        >
                            {currentUserParticipant?.isMuted ? <MicOff className="h-10 w-10"/> : (isListening ? <XCircle className="h-10 w-10"/> : <Mic className="h-10 w-10"/>)}
                        </Button>
                        <p className="font-semibold text-muted-foreground text-sm h-5 w-48 text-center">
                            {currentUserParticipant?.isMuted ? "You are muted by an emcee." : (isListening ? "Listening..." : (isSpeaking ? "Playing incoming audio..." : "Press the mic to talk"))}
                        </p>
                    </div>
                </div>
                 <audio ref={audioPlayerRef} className="hidden" />
            </main>
        </div>
    );
}

    
```
  <change>
    <file>/src/lib/types.ts</file>
    <content><![CDATA[
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
    currentPayorId?: string; // UID of the user currently funding overtime
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
    actions?: ('payToContinue')[];
}

export type TransactionLog = {
    actionType: 'translation_spend' | 'practice_earn' | 'signup_bonus' | 'purchase' | 'referral_bonus' | 'live_sync_spend' | 'live_sync_online_spend' | 'admin_issue' | 'p2p_transfer' | 'sync_online_refund' | 'language_pack_download';
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

export type BuddyRequest = {
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
  buddies?: string[];
  buddyRequests?: BuddyRequest[];
  referredBy?: string;
  unlockedLanguages?: LanguageCode[];
  downloadedPhraseCount?: number;
  immediateBuddyAlert?: boolean;
}

export type NotificationType = 'p2p_transfer' | 'room_closed' | 'room_closed_summary' | 'edit_request' | 'room_canceled' | 'buddy_request' | 'buddy_request_accepted' | 'buddy_alert' | 'referral_bonus' | 'ending_soon_reminder';

export type Notification = {
    id: string;
    userId: string;
    type: NotificationType;
    message: string;
    fromUserName?: string;
    amount?: number;
    roomId?: string;
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
}

export type AudioPack = {
  [phraseId: string]: string; // phraseId: base64 audio data URI
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
