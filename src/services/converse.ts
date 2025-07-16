
'use server';
/**
 * @fileOverview A flow for generating conversational AI responses using the Google AI API.
 *
 * - converse - A function that handles generating a reply in a conversation.
 * - ConverseInput - The input type for the converse function.
 * - ConverseOutput - The return type for the converse function.
 */
import { z } from 'zod';
import axios from 'axios';


const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const ConverseInputSchema = z.object({
  history: z.array(MessageSchema).describe('The conversation history.'),
  language: z.string().describe('The language the user is speaking.'),
  userMessage: z.string().describe('The latest message from the user.'),
});
export type ConverseInput = z.infer<typeof ConverseInputSchema>;

const ConverseOutputSchema = z.object({
  reply: z.string().describe('The AI-generated reply.'),
});
export type ConverseOutput = z.infer<typeof ConverseOutputSchema>;


const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;


export async function converse(input: ConverseInput): Promise<ConverseOutput> {
    
    if (!API_KEY) {
        throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    const prompt = `You are a friendly and patient language tutor. Your role is to have a simple, encouraging conversation with a user who is learning ${input.language}.

Keep your replies short, simple, and directly related to the user's message. Ask open-ended questions to encourage the user to keep talking. Do not correct their grammar unless they make a very significant error. The goal is to build confidence.

Conversation History:
${input.history.map(m => `${m.role === 'user' ? 'User' : 'Tutor'}: ${m.content}`).join('\n')}

User's latest message: "${input.userMessage}"

Your reply should only be the text of your response in a JSON object like {"reply": "your response here"}.`;

    try {
        const response = await axios.post(API_URL, {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
            },
            "safetySettings": [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_HATE_SPEECH",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold": "BLOCK_NONE"
                }
            ]
        });

        // The response is a stringified JSON, so we need to parse it.
        const responseData = JSON.parse(response.data.candidates[0].content.parts[0].text);
        
        const validationResult = ConverseOutputSchema.safeParse(responseData);
        
        if (!validationResult.success) {
            console.error("Gemini API response validation error:", validationResult.error);
            throw new Error("Invalid response format from conversation service.");
        }

        return validationResult.data;

    } catch (error: any) {
        console.error("Error calling Gemini API:", error.response?.data || error.message);
        throw new Error("Failed to get conversational reply.");
    }
}
