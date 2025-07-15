
'use server';
/**
 * @fileOverview A flow for generating a user avatar.
 *
 * - generateAvatar - A function that handles the avatar generation process.
 * - GenerateAvatarInput - The input type for the generateAvatar function.
 * - GenerateAvatarOutput - The return type for the generateAvatar function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from '@/lib/firebase'; // Assuming you have a firebase config file


const GenerateAvatarInputSchema = z.object({
  userId: z.string().describe("The user's unique ID."),
  userName: z.string().describe("The user's name for personalizing the avatar."),
  baseImageUrl: z.string().optional().describe("An optional URL to an existing photo to use as a base."),
});
export type GenerateAvatarInput = z.infer<typeof GenerateAvatarInputSchema>;

const GenerateAvatarOutputSchema = z.object({
  avatarUrl: z.string().describe('The public URL of the generated avatar image in Firebase Storage.'),
});
export type GenerateAvatarOutput = z.infer<typeof GenerateAvatarOutputSchema>;

// Exported wrapper function
export async function generateAvatar(input: GenerateAvatarInput): Promise<GenerateAvatarOutput> {
  return generateAvatarFlow(input);
}


async function convertImageUrlToDataUri(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Main Genkit Flow
const generateAvatarFlow = ai.defineFlow(
  {
    name: 'generateAvatarFlow',
    inputSchema: GenerateAvatarInputSchema,
    outputSchema: GenerateAvatarOutputSchema,
  },
  async ({ userId, userName, baseImageUrl }) => {
    let prompt;

    if (baseImageUrl) {
      // If a base image is provided, create a prompt to stylize it.
      prompt = [
        { media: { url: baseImageUrl } },
        { text: `Generate a friendly, cartoon-style avatar for a traveler named ${userName} based on this photo. The style should be simple, clean, and suitable for a profile picture.` },
      ];
    } else {
      // If no image is provided, generate a default avatar.
      prompt = `Generate a simple, friendly, cartoon-style default avatar for a profile picture. The person's name is ${userName}. The avatar should be an abstract, welcoming character icon, not a realistic person. Think of a simple, modern, flat design.`;
    }

    // Generate the image using the experimental model
    const { media } = await ai.generate({
        model: 'googleai/gemini-2.0-flash-preview-image-generation',
        prompt: prompt,
        config: {
            responseModalities: ['TEXT', 'IMAGE'],
        },
    });

    if (!media || !media.url) {
      throw new Error('Image generation failed to produce an image.');
    }
    
    // The generated image is a data URI (e.g., "data:image/png;base64,...").
    const imageDataUri = media.url;

    // Upload the generated image to Firebase Storage
    const storageRef = ref(storage, `avatars/${userId}/ai-generated-avatar.png`);
    const snapshot = await uploadString(storageRef, imageDataUri, 'data_url');
    const downloadURL = await getDownloadURL(snapshot.ref);

    return {
      avatarUrl: downloadURL,
    };
  }
);

    