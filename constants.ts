import { AsoEntry } from './types';

export const DEFAULT_CPI = 0.09;

// Helper to generate some dates
const today = new Date();
const formatDate = (date: Date) => date.toISOString().split('T')[0];
const subDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

// Initial Seed Data simulating a Google Sheet import
export const INITIAL_DATA: AsoEntry[] = [
  // App 1: SecretBen
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `sb-us-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'SecretBen',
    appGroup: 'SecretBen',
    geo: 'US',
    appId: 'SecretBen 1749590447', // Composite Name + ID
    keyword: 'Secret Ben',
    ranking: Math.max(1, 50 - (i * 3) + Math.floor(Math.random() * 5)), // Ranking improving
    installs: 50 + (i * 10) + Math.floor(Math.random() * 20), // Installs increasing
    cpi: 0.09
  })),
  // App 1: SecretBen (Different Keyword)
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `sb-us-kw2-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'SecretBen',
    appGroup: 'SecretBen',
    geo: 'US',
    appId: 'SecretBen 1749590447',
    keyword: 'Hidden Friend',
    ranking: Math.max(1, 100 - i + Math.floor(Math.random() * 10)),
    installs: 20 + i + Math.floor(Math.random() * 5),
    cpi: 0.12 // Slightly higher CPI for this keyword campaign
  })),
  // App 2: FitnessPro
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `fp-uk-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'FitnessPro',
    appGroup: 'FitnessPro',
    geo: 'UK',
    appId: 'FitnessPro 999888777',
    keyword: 'Home Workout',
    ranking: Math.max(1, 10 + (i % 5)), // Fluctuating rank
    installs: 200 + Math.floor(Math.random() * 50),
    cpi: 0.09
  })),
];
