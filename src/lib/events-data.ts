
export interface StaticEvent {
  countryCode: string;
  date: string; // YYYY-MM-DD format
  name: string;
  description: string;
}

// All dates are in YYYY-MM-DD format for a generic year (e.g., 2024, but the year can be ignored for annual events)
export const staticEvents: StaticEvent[] = [
  // --- Cambodia (KH) ---
  {
    countryCode: 'KH',
    date: '2024-01-01',
    name: 'International New Year\'s Day',
    description: 'Public holiday celebrating the start of the Gregorian new year.'
  },
  {
    countryCode: 'KH',
    date: '2024-01-07',
    name: 'Victory Over Genocide Day',
    description: 'Commemorates the end of the Khmer Rouge regime in 1979.'
  },
  {
    countryCode: 'KH',
    date: '2024-03-08',
    name: 'International Women\'s Day',
    description: 'Public holiday celebrating women\'s rights and achievements.'
  },
  {
    countryCode: 'KH',
    date: '2024-04-13',
    name: 'Khmer New Year (Day 1)',
    description: 'The first day of the traditional Cambodian New Year, a major national festival.'
  },
  {
    countryCode: 'KH',
    date: '2024-04-14',
    name: 'Khmer New Year (Day 2)',
    description: 'The second day of Khmer New Year celebrations.'
  },
  {
    countryCode: 'KH',
    date: '2024-04-15',
    name: 'Khmer New Year (Day 3)',
    description: 'The final day of Khmer New Year celebrations.'
  },
   {
    countryCode: 'KH',
    date: '2024-05-01',
    name: 'International Labour Day',
    description: 'Public holiday celebrating workers.'
  },
  {
    countryCode: 'KH',
    date: '2024-05-14',
    name: 'King Norodom Sihamoni\'s Birthday',
    description: 'Public holiday celebrating the birthday of the current King of Cambodia.'
  },
  {
    countryCode: 'KH',
    date: '2024-05-22',
    name: 'Visak Bochea Day',
    description: 'Commemorates the birth, enlightenment, and death of the Buddha.'
  },
  {
    countryCode: 'KH',
    date: '2024-05-26',
    name: 'Royal Ploughing Ceremony',
    description: 'An ancient royal ceremony to mark the beginning of the rice-growing season.'
  },
  {
    countryCode: 'KH',
    date: '2024-06-18',
    name: 'Queen Mother Norodom Monineath\'s Birthday',
    description: 'Public holiday celebrating the birthday of the Queen Mother.'
  },
  {
    countryCode: 'KH',
    date: '2024-09-24',
    name: 'Constitution Day',
    description: 'Celebrates the signing of the Cambodian Constitution in 1993.'
  },
   {
    countryCode: 'KH',
    date: '2024-10-15',
    name: 'Commemoration Day of King\'s Father',
    description: 'A day to honor the late King Norodom Sihanouk.'
  },
   {
    countryCode: 'KH',
    date: '2024-10-29',
    name: 'King Norodom Sihamoni\'s Coronation Day',
    description: 'Celebrates the anniversary of the King\'s coronation.'
  },
  {
    countryCode: 'KH',
    date: '2024-11-09',
    name: 'Independence Day',
    description: 'Celebrates Cambodia\'s independence from France in 1953.'
  },
  {
    countryCode: 'KH',
    date: '2024-11-26',
    name: 'Water Festival (Bon Om Touk) - Day 1',
    description: 'First day of the Water Festival, celebrating the reversal of the Tonle Sap river flow.'
  },
  {
    countryCode: 'KH',
    date: '2024-11-27',
    name: 'Water Festival (Bon Om Touk) - Day 2',
    description: 'Second day of the Water Festival, featuring boat races.'
  },
  {
    countryCode: 'KH',
    date: '2024-11-28',
    name: 'Water Festival (Bon Om Touk) - Day 3',
    description: 'Final day of the Water Festival with illuminated floats.'
  },

  // Add more events for other countries here...
];
