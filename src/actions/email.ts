
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
  
  console.log('[EMAIL ACTION] Entered sendRoomInviteEmail function.');
  console.log('[EMAIL ACTION] Props received:', { to, roomTopic, creatorName, scheduledAt: scheduledAt.toISOString(), joinUrl });

  const apiKey = process.env.RESEND_API_KEY;
  console.log(`[EMAIL ACTION] RESEND_API_KEY value is: ${apiKey ? 'Found' : 'NOT FOUND'}`);

  if (!apiKey) {
    const errorMsg = "Resend API key is not configured on the server.";
    console.error(`[EMAIL ACTION] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  if (to.length === 0) {
    console.log('[EMAIL ACTION] No recipients provided, skipping email send.');
    return { success: true };
  }
  
  const resend = new Resend(apiKey);
  const formattedDate = format(scheduledAt, 'PPPP p');

  try {
    console.log('[EMAIL ACTION] Attempting to call resend.emails.send...');
    const { data, error } = await resend.emails.send({
      from: 'VibeSync <onboarding@resend.dev>',
      to: to,
      subject: `You're invited to a VibeSync Room: ${roomTopic}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6;">
          <h2>You're Invited!</h2>
          <p><strong>${creatorName}</strong> has invited you to join a VibeSync room.</p>
          <ul>
            <li><strong>Topic:</strong> ${roomTopic}</li>
            <li><strong>When:</strong> ${formattedDate}</li>
          </ul>
          <p>Click the button below to join the room at the scheduled time.</p>
          <a 
            href="${joinUrl}" 
            style="display: inline-block; padding: 12px 24px; background-color: #3156%64%; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;"
          >
            Join Room
          </a>
          <p style="margin-top: 24px; font-size: 12px; color: #888;">
            If you can't click the button, copy and paste this link into your browser:<br>
            <a href="${joinUrl}">${joinUrl}</a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[EMAIL ACTION] Resend API returned an error:', JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }

    console.log('[EMAIL ACTION] Resend API call successful. Response:', JSON.stringify(data, null, 2));
    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL ACTION] An unexpected error occurred in the try/catch block:', error);
    return { success: false, error: 'An unexpected server error occurred while sending the email.' };
  }
}
