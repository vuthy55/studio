
export interface CountryIntelData {
    countryCode: string;
    countryName: string;
    region: 'South East Asia' | 'East Asia' | 'South Asia' | 'Middle East' | 'Europe' | 'Africa' | 'North America' | 'South America' | 'Oceania';
    regionalNews: string[];
    neighbours: string[]; // List of country codes
    localNews: string[];
}

export const countryIntelData: CountryIntelData[] = [
    // South East Asia
    {
        countryCode: 'BN',
        countryName: 'Brunei',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['MY'],
        localNews: ['thebruneian.news', 'borneobulletin.com.bn']
    },
    {
        countryCode: 'KH',
        countryName: 'Cambodia',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['TH', 'VN', 'LA'],
        localNews: ['phnompenhpost.com', 'khmertimeskh.com', 'cambodianess.com']
    },
    {
        countryCode: 'ID',
        countryName: 'Indonesia',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['MY', 'PG', 'TL'],
        localNews: ['thejakartapost.com', 'en.tempo.co', 'antaranews.com']
    },
    {
        countryCode: 'LA',
        countryName: 'Laos',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['TH', 'VN', 'KH', 'MM', 'CN'],
        localNews: ['laotiantimes.com', 'vientianetimes.org.la']
    },
    {
        countryCode: 'MY',
        countryName: 'Malaysia',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['TH', 'ID', 'BN', 'SG'],
        localNews: ['thestar.com.my', 'malaysiakini.com', 'freemalaysiatoday.com']
    },
    {
        countryCode: 'MM',
        countryName: 'Myanmar',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['TH', 'LA', 'CN', 'IN', 'BD'],
        localNews: ['irrawaddy.com', 'frontiermyanmar.net', 'mmtimes.com']
    },
    {
        countryCode: 'PH',
        countryName: 'Philippines',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: [], // Island nation
        localNews: ['rappler.com', 'inquirer.net', 'philstar.com']
    },
    {
        countryCode: 'SG',
        countryName: 'Singapore',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['MY', 'ID'],
        localNews: ['straitstimes.com', 'todayonline.com', 'channelnewsasia.com']
    },
    {
        countryCode: 'TH',
        countryName: 'Thailand',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['MY', 'KH', 'LA', 'MM'],
        localNews: ['bangkokpost.com', 'nationthailand.com', 'thaipbsworld.com']
    },
    {
        countryCode: 'VN',
        countryName: 'Vietnam',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['KH', 'LA', 'CN'],
        localNews: ['vnexpress.net', 'tuoitrenews.vn', 'vir.com.vn']
    },
    {
        countryCode: 'TL',
        countryName: 'Timor-Leste',
        region: 'South East Asia',
        regionalNews: ['channelnewsasia.com', 'scmp.com', 'asia.nikkei.com'],
        neighbours: ['ID'],
        localNews: ['tatoli.tl']
    },
    // Oceania
    {
        countryCode: 'AU',
        countryName: 'Australia',
        region: 'Oceania',
        regionalNews: ['abc.net.au/news', 'smh.com.au', 'theage.com.au'],
        neighbours: [], // Island continent
        localNews: ['news.com.au', 'theguardian.com/au']
    },
    // South America
    {
        countryCode: 'AR',
        countryName: 'Argentina',
        region: 'South America',
        regionalNews: ['mercopress.com/en', 'riotimesonline.com'],
        neighbours: ['CL', 'BO', 'PY', 'BR', 'UY'],
        localNews: ['batimes.com.ar', 'buenosairesherald.com']
    },
    // East Asia
    {
        countryCode: 'CN',
        countryName: 'China',
        region: 'East Asia',
        regionalNews: ['scmp.com', 'asia.nikkei.com'],
        neighbours: ['AF', 'BT', 'IN', 'KZ', 'KG', 'LA', 'MM', 'MN', 'NP', 'KP', 'PK', 'RU', 'TJ', 'VN'],
        localNews: ['globaltimes.cn', 'chinadaily.com.cn', 'xinhuanet.com']
    },
];

    