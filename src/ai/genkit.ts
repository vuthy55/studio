
// This file is retained as a placeholder but the Genkit functionality is removed.
// To re-enable, Genkit dependencies must be added back and build issues resolved.

console.warn(
    'Genkit dependencies have been removed due to build conflicts. Genkit flows will not work.'
);

// Dummy 'ai' object to prevent crashes in files that import it.
// The methods will throw an error if called.
export const ai: any = {
    defineFlow: () => () => { throw new Error('Genkit is disabled.'); },
    definePrompt: () => () => { throw new Error('Genkit is disabled.'); },
    generate: () => { throw new Error('Genkit is disabled.'); },
};
