
'use server';

import { Resend } from 'resend';
import { format } from 'date-fns';

interface SendRoomInviteEmailProps {
  to: string[];
  roomTopic: string;
  creatorName: string;
  scheduledAt: Date;
  joinUrl: string;
}

export async function sendRoomInviteEmail({
  to,
  roomTopic,
  creatorName,
  scheduledAt,
  joinUrl,
}: SendRoomInviteEmailProps): Promise<{ success: boolean; error?: string }> {
  
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email Error: RESEND_API_KEY is not set in the environment variables.');
      return { success: false, error: 'The RESEND_API_KEY is not configured on the server.' };
    }
    
    const resend = new Resend(apiKey);
    
    // Don't send emails if there are no recipients other than the creator
    if (!to || to.length === 0) {
      return { success: true }; // Not an error, just no one to send to.
    }

    const { data, error } = await resend.emails.send({
      from: 'VibeSync <onboarding@resend.dev>',
      to: to,
      subject: `You're invited to a VibeSync Room: ${roomTopic}`,
      html: `
        <div>
          <h2>Hey!</h2>
          <p>You've been invited by <strong>${creatorName}</strong> to join a VibeSync room.</p>
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
