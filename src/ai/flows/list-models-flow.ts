
'use server';

import { ai } from '@/ai/genkit';
import { listModels } from '@genkit-ai/ai/model';

export async function getAvailableModels(): Promise<string[]> {
    const models = await listModels({client: ai});
    return models.map(m => m.name);
}
