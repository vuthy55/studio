'use server';

// This file is intentionally left with a disabled implementation
// to prevent build errors related to Genkit dependencies.
// The actual implementation will be restored when the dependency
// issue is resolved.

export const ai = {
    generate: async (options: any) => {
        console.warn("Genkit is temporarily disabled.");
        if (options.output?.schema) {
            return {
                output: () => ({ translatedText: "AI features are disabled." })
            }
        }
        return {
            text: () => "AI features are disabled."
        }
    }
};
