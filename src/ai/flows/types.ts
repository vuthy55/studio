

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
  neighbours: z.array(z.string()).describe("A list of country codes (ISO 3166-1 alpha-2) for all countries sharing a land border."),
  regionalNews: z.array(z.string()).describe("A list of 3-4 reputable, English-language news source root URLs covering the broader geopolitical region."),
  localNews: z.array(z.string()).describe("A list of 2-3 reputable, English-language news source root URLs based in the target country itself."),
  visaInformation: z.string().describe("A comprehensive, multi-sentence summary of the tourist visa policy for major nationalities (US, UK, EU, AUS)."),
  etiquette: z.array(z.string()).describe("A detailed list of 5-7 essential cultural etiquette rules for travelers."),
  publicHolidays: z
    .array(
        z.object({
            date: z.string().describe("The date or date range of the holiday (e.g., 'January 1', 'April 13-15')."),
            name: z.string().describe("The name of the holiday."),
        })
    )
    .describe("A comprehensive list of at least 8-10 of the most significant national public holidays and major festivals for the entire year, sorted chronologically."),
  emergencyNumbers: z.array(z.string()).describe("A detailed list of national emergency numbers for Police, Ambulance, and Fire, plus any Tourist Police numbers."),
});
export type DiscoverCountryDataOutput = z.infer<typeof DiscoverCountryDataOutputSchema>;


// --- Schemas for get-city-from-coords-flow ---
export const GetCityFromCoordsInputSchema = z.object({
  lat: z.number().describe('The latitude coordinate.'),
  lon: z.number().describe('The longitude coordinate.'),
});
export type GetCityFromCoordsInput = z.infer<typeof GetCityFromCoordsInputSchema>;

export const GetCityFromCoordsOutputSchema = z.object({
  city: z.string().describe('The name of the city for the given coordinates.'),
  country: z.string().describe('The name of the country for the given coordinates.'),
});
export type GetCityFromCoordsOutput = z.infer<typeof GetCityFromCoordsOutputSchema>;

// --- Schemas for discover-transport-options-flow ---
export const DiscoverTransportOptionsInputSchema = z.object({
    fromCity: z.string().describe("The starting city."),
    toCity: z.string().describe("The destination city."),
    country: z.string().describe("The country where the travel is taking place."),
});
export type DiscoverTransportOptionsInput = z.infer<typeof DiscoverTransportOptionsInputSchema>;

export const TransportOptionSchema = z.object({
    type: z.enum(['flight', 'bus', 'train', 'ride-sharing', 'ferry', 'unknown']).describe("The type of transportation."),
    company: z.string().describe("The name of the company or provider (e.g., 'AirAsia', 'Plusliner', 'KTM')."),
    estimatedTravelTime: z.string().describe("The estimated duration of the travel (e.g., '1 hour', '4-5 hours')."),
    typicalPriceRange: z.string().describe("A typical price range for a single ticket (e.g., '$20 - $40 USD', 'from $15 USD')."),
    bookingUrl: z.string().describe("A direct URL to a booking page or a reputable search aggregator (e.g., Skyscanner, 12go.asia)."),
});
export type TransportOption = z.infer<typeof TransportOptionSchema>;

export const DiscoverTransportOptionsOutputSchema = z.array(TransportOptionSchema).describe("A list of transport options found.");
export type DiscoverTransportOptionsOutput = z.infer<typeof DiscoverTransportOptionsOutputSchema>;


// --- Schemas for discover-transport-providers-flow ---
export const DiscoverTransportProvidersInputSchema = z.object({
  countryName: z.string().describe('The full, official name of the country to research.'),
});
export type DiscoverTransportProvidersInput = z.infer<typeof DiscoverTransportProvidersInputSchema>;

export const DiscoverTransportProvidersOutputSchema = z.object({
  countryName: z.string().describe("The official name of the country, matching the input."),
  region: z.string().describe("The primary geopolitical region or continent the country belongs to (e.g., 'South East Asia', 'South America', 'Western Europe')."),
  regionalTransportProviders: z.array(z.string()).describe("A list of 3-5 major regional airline root URLs (e.g., 'airasia.com')."),
  localTransportProviders: z.array(z.string()).describe("A list of 3-5 major local transport provider root URLs including trains, buses, ferries, and ride-sharing (e.g., 'ktmb.com.my', '12go.asia', 'grab.com')."),
});
export type DiscoverTransportProvidersOutput = z.infer<typeof DiscoverTransportProvidersOutputSchema>;

// --- Schemas for discover-eco-intel-flow ---
export const DiscoverEcoIntelInputSchema = z.object({
    countryName: z.string().describe('The country to research.'),
    searchResultsText: z.string().describe('The scraped text content from web search results to be analyzed.'),
});
export type DiscoverEcoIntelInput = z.infer<typeof DiscoverEcoIntelInputSchema>;

export const DiscoverEcoIntelOutputSchema = z.object({
  countryName: z.string().describe("The official name of the country, matching the input."),
  region: z.string().describe("The primary geopolitical region or continent the country belongs to."),
  offsettingOpportunities: z.array(z.object({
        name: z.string().describe("The name of the organization or project."),
        url: z.string().url().describe("The direct URL to the project or organization."),
        description: z.string().describe("A one-sentence summary of the opportunity."),
        activityType: z.enum(['tree_planting', 'coral_planting', 'recycling', 'conservation', 'other']).describe("The primary activity type."),
  })).describe("A list of local offsetting opportunities.")
});
export type DiscoverEcoIntelOutput = z.infer<typeof DiscoverEcoIntelOutputSchema>;


// --- Schemas for calculate-eco-footprint-flow ---
export const EcoFootprintInputSchema = z.object({
    travelDescription: z.string().describe("A free-text description of the user's travel itinerary."),
    destinationCountryCode: z.string().describe("The ISO 3166-1 alpha-2 code of the primary destination country."),
});
export type EcoFootprintInput = z.infer<typeof EcoFootprintInputSchema>;

export const EcoFootprintOutputSchema = z.object({
    totalFootprintKgCo2: z.number().describe("The total estimated carbon footprint for the entire journey, in kilograms of CO2."),
    breakdown: z.array(z.object({
        item: z.string().describe("A description of the travel segment, e.g., 'Flight: KUL to REP' or 'Hotel Stay (2 nights)'."),
        footprint: z.number().describe("The carbon footprint for this specific item in kg CO2."),
    })).describe("An itemized list of each component of the journey and its individual carbon footprint."),
    methodology: z.string().describe("A brief, user-friendly explanation of the assumptions made during the calculation (e.g., 'Assumed standard hotel energy usage...')."),
    offsetSuggestion: z.string().describe("A tangible, easy-to-understand suggestion for how the user could offset their carbon footprint."),
    localOpportunities: z.array(z.object({
        name: z.string(),
        url: z.string().url(),
        description: z.string(),
        activityType: z.string(),
    })).describe("A list of local offsetting opportunities, like tree planting organizations, taken from a curated database."),
    references: z.array(z.string().url()).describe("A list of URLs for the trusted sources used to perform the calculations."),
});
export type EcoFootprintOutput = z.infer<typeof EcoFootprintOutputSchema>;
