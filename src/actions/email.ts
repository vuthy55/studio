
'use server';

import { Resend } from 'resend';
import { format } from 'date-fns';
import { db } from '@/lib/firebase-admin';
import { serverTimestamp } from 'firebase-admin/firestore';

interface SendRoomInviteEmailProps {
  to: string[];
  roomTopic: string;
  fromName: string;
  roomId: string;
  scheduledAt: Date;
  joinUrl: string;
}

export async function sendRoomInviteEmail({
  to,
  roomTopic,
  fromName,
  roomId,
  scheduledAt,
  joinUrl,
}: SendRoomInviteEmailProps): Promise<{ success: boolean; error?: string }> {
  
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email Error: RESEND_API_KEY is not set in the environment variables.');
      return { success: false, error: 'The RESEND_API_KEY is not configured on the server.' };
    }
    
    // Don't proceed if there are no recipients
    if (!to || to.length === 0) {
      return { success: true }; 
    }
    
    // --- Step 1: Query for existing users to send in-app notifications ---
    const existingUsersQuery = db.collection('users').where('email', 'in', to);
    const existingUsersSnapshot = await existingUsersQuery.get();
    const existingEmails = new Set<string>();

    if (!existingUsersSnapshot.empty) {
        const batch = db.batch();

        existingUsersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userEmail = userData.email.toLowerCase();
            existingEmails.add(userEmail);

            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
                userId: doc.id,
                type: 'room_invite',
                message: `${fromName} has invited you to the room: "${roomTopic}"`,
                roomId: roomId,
                createdAt: serverTimestamp(),
                read: false,
            });
        });
        
        await batch.commit();
    }


    // --- Step 2: Send emails only to non-existing users ---
    const externalEmails = to.filter(email => !existingEmails.has(email.toLowerCase()));

    if (externalEmails.length > 0) {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: 'VibeSync <onboarding@resend.dev>',
        to: externalEmails,
        subject: `You're invited to a VibeSync Room: ${roomTopic}`,
        html: `
          <div>
            <h2>Hey!</h2>
            <p>You've been invited by <strong>${fromName}</strong> to join a VibeSync room.</p>
            <p><strong>Topic:</strong> ${roomTopic}</p>
            <p><strong>When:</strong> ${format(new Date(scheduledAt), 'PPPPp')}</p>
            <br/>
            <a href="${joinUrl}" style="background-color: #D4A373; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join the Room</a>
            <br/>
            <p>See you there!</p>
            <p>- The VibeSync Team</p>
          </div>
        `,
      });

      if (error) {
        console.error('Resend API Error:', error);
        return { success: false, error: error.message };
      }

      console.log('Resend API Success:', data);
    }

    return { success: true };

  } catch (e: any) {
    console.error('Unexpected Error in sendRoomInviteEmail:', e);
    return { success: false, error: e.message || 'An unexpected server error occurred.' };
  }
}

/**
 * Sends a hardcoded test email to the specified address to verify Resend functionality.
 * @param toEmail The email address to send the test email to.
 * @returns A promise indicating success or failure.
 */
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; error?: string }> {
  if (!toEmail) {
    return { success: false, error: 'A recipient email is required.' };
  }
  
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email Error: RESEND_API_KEY is not set.');
      return { success: false, error: 'The RESEND_API_KEY is not configured on the server.' };
    }
    
    const resend = new Resend(apiKey);
    
    const { data, error } = await resend.emails.send({
      from: 'VibeSync <onboarding@resend.dev>',
      to: [toEmail],
      subject: 'VibeSync Test Email',
      html: `
        <div>
          <h1>Email Test Successful!</h1>
          <p>If you are receiving this, your Resend API integration is working correctly.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend Test API Error:', error);
      return { success: false, error: error.message };
    }

    console.log('Resend Test API Success:', data);
    return { success: true };

  } catch (e: any) {
    console.error('Unexpected Error in sendTestEmail:', e);
    return { success: false, error: e.message || 'An unexpected server error occurred.' };
  }
}


interface SendRoomReminderEmailProps {
  to: string;
  roomTopic: string;
  minutesRemaining: number;
  extraMinutes: number;
}

export async function sendRoomEndingSoonEmail({
  to,
  roomTopic,
  minutesRemaining,
  extraMinutes,
}: SendRoomReminderEmailProps): Promise<{ success: boolean, error?: string }> {
   try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email Error: RESEND_API_KEY is not set.');
      return { success: false, error: 'The RESEND_API_KEY is not configured on the server.' };
    }

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: 'VibeSync <onboarding@resend.dev>',
      to: [to],
      subject: `Action Required: Your VibeSync Room "${roomTopic}" is ending soon`,
      html: `
        <div>
          <h2>Heads up!</h2>
          <p>Your VibeSync room, <strong>"${roomTopic}"</strong>, is scheduled to end in approximately <strong>${minutesRemaining} minutes</strong>.</p>
          <p>Based on your current token balance, the meeting can continue for an additional <strong>${extraMinutes} minutes</strong> after the scheduled time ends.</p>
          <br/>
          <p>To avoid interruption, you can top up your token balance or ask another participant to transfer tokens to you.</p>
          <br/>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/profile?tab=wallet" style="background-color: #D4A373; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Manage Tokens</a>
          <br/>
          <p>- The VibeSync Team</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API Error (Room Reminder):', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    console.error('Unexpected Error in sendRoomEndingSoonEmail:', e);
    return { success: false, error: e.message || 'An unexpected server error occurred.' };
  }
}

interface SendVibeInviteEmailProps {
  to: string[];
  vibeTopic: string;
  creatorName: string;
  joinUrl: string;
}

export async function sendVibeInviteEmail({
  to,
  vibeTopic,
  creatorName,
  joinUrl,
}: SendVibeInviteEmailProps): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email Error: RESEND_API_KEY is not set.');
      return { success: false, error: 'The RESEND_API_KEY is not configured on the server.' };
    }

    const resend = new Resend(apiKey);
    
    if (!to || to.length === 0) {
      return { success: true };
    }

    const { data, error } = await resend.emails.send({
      from: 'VibeSync <onboarding@resend.dev>',
      to: to,
      subject: `You're invited to a Vibe: ${vibeTopic}`,
      html: `
        <div>
          <h2>Hey!</h2>
          <p>You've been invited by <strong>${creatorName}</strong> to join a discussion in the Common Room.</p>
          <p><strong>Topic:</strong> ${vibeTopic}</p>
          <br/>
          <a href="${joinUrl}" style="background-color: #D4A373; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join the Vibe</a>
          <br/>
          <p>See you there!</p>
          <p>- The VibeSync Team</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API Error (Vibe Invite):', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: any) {
    console.error('Unexpected Error in sendVibeInviteEmail:', e);
    return { success: false, error: e.message || 'An unexpected server error occurred.' };
  }
}
