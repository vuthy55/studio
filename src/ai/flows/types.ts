
import { z } from 'zod';

export const TranslateTextInputSchema = z.object({
    text: z.string(),
    fromLanguage: z.string(),
    toLanguage: z.string(),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
    translatedText: z.string(),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;


export const DiscoverCountryDataInputSchema = z.object({
  countryName: z.string().describe('The full, official name of the country to research.'),
});
export type DiscoverCountryDataInput = z.infer<typeof DiscoverCountryDataInputSchema>;

export const DiscoverCountryDataOutputSchema = z.object({
  countryName: z.string().describe("The official name of the country, matching the input."),
  region: z.string().describe("The primary geopolitical region or continent the country belongs to (e.g., 'South East Asia', 'South America', 'Western Europe')."),
  neighbours: z.array(z.string()).describe("A list of country codes (ISO 3166-1 alpha-2) for all countries sharing a land border with the target country."),
  regionalNews: z.array(z.string()).describe("A list of 3-4 reputable, English-language news source root URLs covering the broader geopolitical region."),
  localNews: z.array(z.string()).describe("A list of 2-3 reputable, English-language news source root URLs based in the target country itself."),
});
export type DiscoverCountryDataOutput = z.infer<typeof DiscoverCountryDataOutputSchema>;
