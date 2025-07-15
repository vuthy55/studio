
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

const GenerateAvatarInputSchema = z.object({
  userName: z.string().describe("The user's name for personalizing the avatar."),
  baseImageUrl: z.string().optional().describe("An optional URL to an existing photo to use as a base."),
});
export type GenerateAvatarInput = z.infer<typeof GenerateAvatarInputSchema>;

const GenerateAvatarOutputSchema = z.object({
  imageDataUri: z.string().describe("The generated image as a data URI. Expected format: 'data:image/png;base64,<encoded_data>'"),
});
export type GenerateAvatarOutput = z.infer<typeof GenerateAvatarOutputSchema>;

// Exported wrapper function
export async function generateAvatar(input: GenerateAvatarInput): Promise<GenerateAvatarOutput> {
  return generateAvatarFlow(input);
}

// Main Genkit Flow
const generateAvatarFlow = ai.defineFlow(
  {
    name: 'generateAvatarFlow',
    inputSchema: GenerateAvatarInputSchema,
    outputSchema: GenerateAvatarOutputSchema,
  },
  async ({ userName, baseImageUrl }) => {
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

    return {
      imageDataUri: imageDataUri,
    };
  }
);
