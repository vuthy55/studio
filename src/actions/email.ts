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
  
  console.log('--- ENTERING EMAIL ACTION ---');
  console.log('Attempting to send email to:', to);

  // This is a temporary debug step. If this log appears, we know the action runs.
  // The next step would be to re-introduce the Resend code carefully.
  
  return { success: true };

}
