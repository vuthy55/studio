'use server';
/**
 * @fileOverview A service for handling Azure-specific server-side operations, like generating tokens.
 *
 * - getSpeechRecognitionToken - A function that creates a short-lived authorization token for Azure Speech Services.
 */
import axios from 'axios';

export async function getSpeechRecognitionToken(): Promise<{ authToken: string; region: string }> {
  const speechKey = process.env.AZURE_TTS_KEY;
  const speechRegion = process.env.AZURE_TTS_REGION;

  if (!speechKey || !speechRegion) {
    throw new Error('Azure TTS credentials are not configured in environment variables.');
  }

  const tokenEndpoint = `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;

  try {
    const response = await axios.post(tokenEndpoint, null, {
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return { authToken: response.data, region: speechRegion };
  } catch (err: any) {
    console.error('Error fetching Azure speech token:', err.response?.data || err.message);
    throw new Error('Failed to get speech recognition token.');
  }
}
