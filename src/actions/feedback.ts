
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const feedbackSchema = z.object({
  category: z.string(),
  comment: z.string(),
  screenshot: z.any().optional(),
});

type FeedbackInput = z.infer<typeof feedbackSchema>;

interface UserInfo {
    uid: string;
    email: string;
    name: string;
}

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

export async function submitFeedback(data: FeedbackInput, user: UserInfo): Promise<{ success: boolean; error?: string }> {
  const validation = feedbackSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: 'Invalid form data provided.' };
  }

  const { category, comment, screenshot } = validation.data;
  let screenshotUrl: string | undefined = undefined;

  try {
    if (screenshot && screenshot.size > 0) {
      const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const fileName = `feedback/${user.uid}/${new Date().getTime()}-${screenshot.name}`;
      const file = bucket.file(fileName);

      const buffer = Buffer.from(await screenshot.arrayBuffer());

      await file.save(buffer, {
        metadata: {
          contentType: screenshot.type,
        },
      });

      screenshotUrl = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491', // A very long time in the future
      }).then(urls => urls[0]);
    }

    const feedbackRef = db.collection('feedback').doc();
    await feedbackRef.set({
      userId: user.uid,
      userName: user.name,
      userEmail: user.email,
      category,
      comment,
      screenshotUrl,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    return { success: false, error: 'An unexpected server error occurred.' };
  }
}

export async function getFeedbackSubmissions(): Promise<FeedbackSubmission[]> {
    try {
        const feedbackRef = db.collection('feedback');
        const q = feedbackRef.orderBy('createdAt', 'desc');
        const snapshot = await q.get();

        if (snapshot.empty) {
            return [];
        }

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedbackSubmission));

    } catch (error) {
        console.error("Error fetching feedback submissions:", error);
        return [];
    }
}
