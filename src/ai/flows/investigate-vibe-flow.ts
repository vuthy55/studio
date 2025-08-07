
'use server';
/**
 * @fileOverview A Genkit flow to assist in moderating a Vibe conversation.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { getAppSettingsAction } from '@/actions/settings';

const VibeInvestigationInputSchema = z.object({
  content: z.string().describe("The full concatenated text content of the entire Vibe's conversation."),
  rules: z.string().describe("The community rules to judge the content against."),
});
export type VibeInvestigationInput = z.infer<typeof VibeInvestigationInputSchema>;

const VibeInvestigationOutputSchema = z.object({
  judgment: z.string().describe("A one-sentence summary of the final judgment (e.g., 'Clear violation of hate speech rules.', 'No clear violation found.', 'Potential violation of respectful conduct.')."),
  reasoning: z.string().describe("A brief, neutral explanation for the judgment, referencing specific rules if possible."),
  flaggedPostIds: z.array(z.string()).describe("An array of the exact post IDs that contain violating content. The IDs should be extracted from the provided content format `POSTID::AUTHOR: content`."),
});
export type VibeInvestigation = z.infer<typeof VibeInvestigationOutputSchema>;

const investigateVibeFlow = ai.defineFlow(
  {
    name: 'investigateVibeFlow',
    inputSchema: VibeInvestigationInputSchema,
    outputSchema: VibeInvestigationOutputSchema,
  },
  async ({ content, rules }) => {
    
    const { output } = await ai.generate({
      prompt: `
        You are a neutral, unbiased content moderator AI called the "AI Investigator" (AII).
        Your task is to analyze a conversation from a travel app's Vibe (a community forum) and determine if it violates the community rules.

        **Community Rules:**
        ---
        ${rules}
        ---

        **Conversation Content to Analyze:**
        The conversation is provided below. Each post is prefixed with "POSTID::" followed by the post's unique ID, then the author, and then the content.
        ---
        ${content}
        ---

        **Instructions:**
        1.  Carefully read the entire conversation.
        2.  Compare the content of each post against the community rules provided.
        3.  Identify the **exact Post IDs** of any posts that contain clear violations.
        4.  Provide a final judgment and a brief, factual reasoning. Do not be overly sensitive; focus on clear-cut violations of the rules, especially regarding safety, harassment, hate speech, and illegal activities. It is okay to conclude that no violation occurred.
        5.  Your response MUST be in the requested JSON format.
      `,
      model: 'googleai/gemini-1.5-flash',
      output: {
        schema: VibeInvestigationOutputSchema,
      },
    });

    return output!;
  }
);

export async function investigateVibe(input: VibeInvestigationInput): Promise<VibeInvestigation> {
  // The 'rules' will be fetched automatically and passed in.
  // This wrapper simplifies the client-side call.
  return investigateVibeFlow(input);
}
