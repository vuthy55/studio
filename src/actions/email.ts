
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

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendRoomInviteEmail({
  to,
  roomTopic,
  creatorName,
  scheduledAt,
  joinUrl,
}: SendRoomInviteEmailProps): Promise<{ success: boolean; error?: string }> {
  
  const formattedDate = format(scheduledAt, 'PPPP p'); // e.g., "July 22, 2024 at 10:30 AM"

  try {
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
      console.error('Resend API error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return { success: false, error: 'An unexpected error occurred while sending the email.' };
  }
}

