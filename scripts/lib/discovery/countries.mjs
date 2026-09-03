// One table, two uses: region grouping for movements.json and ISO2 codes for
// Google News locale parameters. Unknown countries return '' so a caller can
// leave the field blank for a human rather than guessing wrong.

const COUNTRIES = {
  // Africa
  Nigeria: ['Africa', 'NG'], Kenya: ['Africa', 'KE'], 'South Africa': ['Africa', 'ZA'],
  Uganda: ['Africa', 'UG'], Ghana: ['Africa', 'GH'], Ethiopia: ['Africa', 'ET'],
  Sudan: ['Africa', 'SD'], Senegal: ['Africa', 'SN'], "Côte d'Ivoire": ['Africa', 'CI'],
  Tanzania: ['Africa', 'TZ'], Zimbabwe: ['Africa', 'ZW'], Malawi: ['Africa', 'MW'],
  Cameroon: ['Africa', 'CM'], Mozambique: ['Africa', 'MZ'], Tunisia: ['Africa', 'TN'],
  Morocco: ['Africa', 'MA'], Algeria: ['Africa', 'DZ'], Egypt: ['Africa', 'EG'],
  // Americas
  'United States': ['Americas', 'US'], Canada: ['Americas', 'CA'], Mexico: ['Americas', 'MX'],
  Brazil: ['Americas', 'BR'], Argentina: ['Americas', 'AR'], Chile: ['Americas', 'CL'],
  Colombia: ['Americas', 'CO'], Peru: ['Americas', 'PE'], Bolivia: ['Americas', 'BO'],
  Ecuador: ['Americas', 'EC'], Venezuela: ['Americas', 'VE'], Panama: ['Americas', 'PA'],
  Guatemala: ['Americas', 'GT'], Haiti: ['Americas', 'HT'], Cuba: ['Americas', 'CU'],
  // Asia
  India: ['Asia', 'IN'], Pakistan: ['Asia', 'PK'], Bangladesh: ['Asia', 'BD'],
  Indonesia: ['Asia', 'ID'], Philippines: ['Asia', 'PH'], Thailand: ['Asia', 'TH'],
  Vietnam: ['Asia', 'VN'], Malaysia: ['Asia', 'MY'], Singapore: ['Asia', 'SG'],
  'Sri Lanka': ['Asia', 'LK'], Nepal: ['Asia', 'NP'], Myanmar: ['Asia', 'MM'],
  China: ['Asia', 'CN'], Japan: ['Asia', 'JP'], 'South Korea': ['Asia', 'KR'],
  Mongolia: ['Asia', 'MN'], Kazakhstan: ['Asia', 'KZ'], Maldives: ['Asia', 'MV'],
  // Europe
  Spain: ['Europe', 'ES'], France: ['Europe', 'FR'], Germany: ['Europe', 'DE'],
  Italy: ['Europe', 'IT'], Portugal: ['Europe', 'PT'], 'United Kingdom': ['Europe', 'GB'],
  Ireland: ['Europe', 'IE'], Netherlands: ['Europe', 'NL'], Belgium: ['Europe', 'BE'],
  Austria: ['Europe', 'AT'], Poland: ['Europe', 'PL'], Hungary: ['Europe', 'HU'],
  Greece: ['Europe', 'GR'], Serbia: ['Europe', 'RS'], Bulgaria: ['Europe', 'BG'],
  Romania: ['Europe', 'RO'], Albania: ['Europe', 'AL'], Georgia: ['Europe', 'GE'],
  Ukraine: ['Europe', 'UA'], Russia: ['Europe', 'RU'], Slovakia: ['Europe', 'SK'],
  // Middle East
  Iran: ['Middle East', 'IR'], Iraq: ['Middle East', 'IQ'], Israel: ['Middle East', 'IL'],
  Turkey: ['Middle East', 'TR'], Lebanon: ['Middle East', 'LB'], Syria: ['Middle East', 'SY'],
  Jordan: ['Middle East', 'JO'], 'Saudi Arabia': ['Middle East', 'SA'], Yemen: ['Middle East', 'YE'],
  // Oceania
  Australia: ['Oceania', 'AU'], 'New Zealand': ['Oceania', 'NZ'],
  'Papua New Guinea': ['Oceania', 'PG'], Fiji: ['Oceania', 'FJ'],
};

export function countryToRegion(country) {
  return COUNTRIES[String(country || '').trim()]?.[0] || '';
}

export function countryToIso2(country) {
  return COUNTRIES[String(country || '').trim()]?.[1] || '';
}
