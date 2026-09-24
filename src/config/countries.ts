/**
 * Destination countries the agency places students in. ISO 3166-1 alpha-2.
 * Short on purpose — a select with 250 entries helps nobody; add as needed.
 */
export const COUNTRIES = [
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'IE', name: 'Ireland' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
] as const

export type CountryCode = (typeof COUNTRIES)[number]['code']

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}
