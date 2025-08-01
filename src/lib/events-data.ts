
export interface StaticEvent {
  countryCode: string;
  date: string; // YYYY-MM-DD format
  name: string;
  description: string;
}

// All dates are in YYYY-MM-DD format for a generic year (e.g., 2024, but the year can be ignored for annual events)
export const staticEvents: StaticEvent[] = [
  // --- Brunei (BN) ---
  { countryCode: 'BN', date: '2024-01-01', name: 'New Year\'s Day', description: 'Public holiday.' },
  { countryCode: 'BN', date: '2024-02-08', name: 'Isra and Mi\'raj', description: 'Islamic holiday commemorating the Prophet\'s night journey.' },
  { countryCode: 'BN', date: '2024-02-23', name: 'National Day', description: 'Celebrates Brunei\'s independence.' },
  { countryCode: 'BN', date: '2024-04-10', name: 'Hari Raya Aidilfitri (Eid al-Fitr)', description: 'Marks the end of Ramadan. Dates vary by lunar calendar.' },
  { countryCode: 'BN', date: '2024-05-31', name: 'Royal Brunei Armed Forces Day', description: 'Celebrates the armed forces.' },
  { countryCode: 'BN', date: '2024-07-15', name: 'Sultan\'s Birthday', description: 'Public holiday for the Sultan of Brunei\'s birthday.' },
  
  // --- Cambodia (KH) ---
  { countryCode: 'KH', date: '2024-01-01', name: 'International New Year\'s Day', description: 'Public holiday celebrating the start of the Gregorian new year.' },
  { countryCode: 'KH', date: '2024-01-07', name: 'Victory Over Genocide Day', description: 'Commemorates the end of the Khmer Rouge regime in 1979.' },
  { countryCode: 'KH', date: '2024-03-08', name: 'International Women\'s Day', description: 'Public holiday celebrating women\'s rights and achievements.' },
  { countryCode: 'KH', date: '2024-04-13', name: 'Khmer New Year (Day 1)', description: 'The first day of the traditional Cambodian New Year, a major national festival.' },
  { countryCode: 'KH', date: '2024-04-14', name: 'Khmer New Year (Day 2)', description: 'The second day of Khmer New Year celebrations.' },
  { countryCode: 'KH', date: '2024-04-15', name: 'Khmer New Year (Day 3)', description: 'The final day of Khmer New Year celebrations.' },
  { countryCode: 'KH', date: '2024-05-01', name: 'International Labour Day', description: 'Public holiday celebrating workers.' },
  { countryCode: 'KH', date: '2024-05-14', name: 'King Norodom Sihamoni\'s Birthday', description: 'Public holiday celebrating the birthday of the current King of Cambodia.' },
  { countryCode: 'KH', date: '2024-05-22', name: 'Visak Bochea Day', description: 'Commemorates the birth, enlightenment, and death of the Buddha.' },
  { countryCode: 'KH', date: '2024-05-26', name: 'Royal Ploughing Ceremony', description: 'An ancient royal ceremony to mark the beginning of the rice-growing season.' },
  { countryCode: 'KH', date: '2024-06-18', name: 'Queen Mother Norodom Monineath\'s Birthday', description: 'Public holiday celebrating the birthday of the Queen Mother.' },
  { countryCode: 'KH', date: '2024-09-24', name: 'Constitution Day', description: 'Celebrates the signing of the Cambodian Constitution in 1993.' },
  { countryCode: 'KH', date: '2024-10-15', name: 'Commemoration Day of King\'s Father', description: 'A day to honor the late King Norodom Sihanouk.' },
  { countryCode: 'KH', date: '2024-10-29', name: 'King Norodom Sihamoni\'s Coronation Day', description: 'Celebrates the anniversary of the King\'s coronation.' },
  { countryCode: 'KH', date: '2024-11-09', name: 'Independence Day', description: 'Celebrates Cambodia\'s independence from France in 1953.' },
  { countryCode: 'KH', date: '2024-11-26', name: 'Water Festival (Bon Om Touk) - Day 1', description: 'First day of the Water Festival, celebrating the reversal of the Tonle Sap river flow.' },
  { countryCode: 'KH', date: '2024-11-27', name: 'Water Festival (Bon Om Touk) - Day 2', description: 'Second day of the Water Festival, featuring boat races.' },
  { countryCode: 'KH', date: '2024-11-28', name: 'Water Festival (Bon Om Touk) - Day 3', description: 'Final day of the Water Festival with illuminated floats.' },

  // --- Indonesia (ID) ---
  { countryCode: 'ID', date: '2024-01-01', name: 'New Year\'s Day', description: 'Public holiday.' },
  { countryCode: 'ID', date: '2024-04-10', name: 'Idul Fitri (Eid al-Fitr)', description: 'Marks the end of Ramadan. Dates vary.' },
  { countryCode: 'ID', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'ID', date: '2024-06-01', name: 'Pancasila Day', description: 'Commemorates the state philosophy.' },
  { countryCode: 'ID', date: '2024-08-17', name: 'Independence Day', description: 'Celebrates independence from Dutch rule.' },
  { countryCode: 'ID', date: '2024-12-25', name: 'Christmas Day', description: 'Public holiday.' },

  // --- Laos (LA) ---
  { countryCode: 'LA', date: '2024-01-01', name: 'International New Year\'s Day', description: 'Public holiday.' },
  { countryCode: 'LA', date: '2024-03-08', name: 'International Women\'s Day', description: 'Public holiday.' },
  { countryCode: 'LA', date: '2024-04-14', name: 'Lao New Year (Pi Mai)', description: 'Major traditional festival, similar to Songkran and Khmer New Year.' },
  { countryCode: 'LA', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'LA', date: '2024-12-02', name: 'Lao National Day', description: 'Commemorates the establishment of the Lao People\'s Democratic Republic in 1975.' },

  // --- Malaysia (MY) ---
  { countryCode: 'MY', date: '2024-01-25', name: 'Thaipusam', description: 'Hindu festival, a public holiday in several states.' },
  { countryCode: 'MY', date: '2024-02-10', name: 'Chinese New Year', description: 'Major festival celebrated by the Chinese community.' },
  { countryCode: 'MY', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'MY', date: '2024-05-22', name: 'Wesak Day', description: 'Buddhist holiday commemorating the birth, enlightenment, and death of Buddha.' },
  { countryCode: 'MY', date: '2024-08-31', name: 'National Day (Hari Merdeka)', description: 'Celebrates Malaysia\'s independence.' },
  { countryCode: 'MY', date: '2024-10-31', name: 'Deepavali (Diwali)', description: 'Hindu festival of lights. Dates vary.' },
  { countryCode: 'MY', date: '2024-12-25', name: 'Christmas Day', description: 'Public holiday.' },
  
  // --- Myanmar (MM) ---
  { countryCode: 'MM', date: '2024-01-04', name: 'Independence Day', description: 'Celebrates independence from the British.' },
  { countryCode: 'MM', date: '2024-02-12', name: 'Union Day', description: 'Commemorates the Panglong Agreement.' },
  { countryCode: 'MM', date: '2024-04-13', name: 'Thingyan (Water Festival)', description: 'Myanmar\'s New Year water festival, lasting several days.' },
  { countryCode: 'MM', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'MM', date: '2024-07-19', name: 'Martyrs\' Day', description: 'Commemorates the assassination of General Aung San and other leaders.' },

  // --- Philippines (PH) ---
  { countryCode: 'PH', date: '2024-01-01', name: 'New Year\'s Day', description: 'Public holiday.' },
  { countryCode: 'PH', date: '2024-04-09', name: 'Day of Valor (Araw ng Kagitingan)', description: 'Commemorates the fall of Bataan during World War II.' },
  { countryCode: 'PH', date: '2024-03-29', name: 'Good Friday', description: 'Major Christian holiday.' },
  { countryCode: 'PH', date: '2024-05-01', name: 'Labor Day', description: 'Public holiday.' },
  { countryCode: 'PH', date: '2024-06-12', name: 'Independence Day', description: 'Celebrates independence from Spain.' },
  { countryCode: 'PH', date: '2024-08-26', name: 'National Heroes Day', description: 'Public holiday to honor national heroes.' },
  { countryCode: 'PH', date: '2024-12-25', name: 'Christmas Day', description: 'Major holiday celebration.' },
  { countryCode: 'PH', date: '2024-12-30', name: 'Rizal Day', description: 'Commemorates the execution of national hero José Rizal.' },

  // --- Singapore (SG) ---
  { countryCode: 'SG', date: '2024-01-01', name: 'New Year\'s Day', description: 'Public holiday.' },
  { countryCode: 'SG', date: '2024-02-10', name: 'Chinese New Year', description: 'Major two-day festival.' },
  { countryCode: 'SG', date: '2024-03-29', name: 'Good Friday', description: 'Public holiday.' },
  { countryCode: 'SG', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'SG', date: '2024-05-22', name: 'Vesak Day', description: 'Buddhist holiday.' },
  { countryCode: 'SG', date: '2024-08-09', name: 'National Day', description: 'Celebrates Singapore\'s independence.' },
  { countryCode: 'SG', date: '2024-10-31', name: 'Deepavali', description: 'Hindu festival of lights.' },
  { countryCode: 'SG', date: '2024-12-25', name: 'Christmas Day', description: 'Public holiday.' },

  // --- Thailand (TH) ---
  { countryCode: 'TH', date: '2024-02-24', name: 'Makha Bucha Day', description: 'Important Buddhist holiday.' },
  { countryCode: 'TH', date: '2024-04-06', name: 'Chakri Memorial Day', description: 'Commemorates the founding of the Chakri Dynasty.' },
  { countryCode: 'TH', date: '2024-04-13', name: 'Songkran Festival', description: 'The famous Thai New Year water festival.' },
  { countryCode: 'TH', date: '2024-05-01', name: 'Labour Day', description: 'Public holiday.' },
  { countryCode: 'TH', date: '2024-07-28', name: 'King Vajiralongkorn\'s Birthday', description: 'Celebrates the current king\'s birthday.' },
  { countryCode: 'TH', date: '2024-08-12', name: 'The Queen Mother\'s Birthday (Mother\'s Day)', description: 'Public holiday.' },
  { countryCode: 'TH', date: '2024-10-13', name: 'Anniversary of the Passing of King Bhumibol', description: 'Commemoration day.' },
  { countryCode: 'TH', date: '2024-12-05', name: 'King Bhumibol\'s Birthday (Father\'s Day)', description: 'Public holiday.' },
  { countryCode: 'TH', date: '2024-12-10', name: 'Constitution Day', description: 'Public holiday.' },

  // --- Vietnam (VN) ---
  { countryCode: 'VN', date: '2024-01-01', name: 'New Year\'s Day', description: 'Gregorian New Year.' },
  { countryCode: 'VN', date: '2024-02-10', name: 'Tết Nguyên Đán (Lunar New Year)', description: 'The most important festival in Vietnam, lasting several days.' },
  { countryCode: 'VN', date: '2024-04-18', name: 'Hung Kings\' Commemoration Day', description: 'Commemorates the ancient Hung Kings.' },
  { countryCode: 'VN', date: '2024-04-30', name: 'Reunification Day', description: 'Marks the end of the Vietnam War.' },
  { countryCode: 'VN', date: '2024-05-01', name: 'International Labour Day', description: 'Public holiday.' },
  { countryCode: 'VN', date: '2024-09-02', name: 'National Day', description: 'Commemorates the declaration of independence from France.' },
];
