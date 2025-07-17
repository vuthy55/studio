
'use server';

import { ai } from '@/ai/genkit';
import { listModels } from 'genkit/plugins';

export async function getAvailableModels(): Promise<string[]> {
    const models = await listModels();
    return models.map(m => m.name);
}
