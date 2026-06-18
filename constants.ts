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
  // App 1: Demo Finance
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `sb-us-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'Demo Finance',
    appGroup: 'Demo Finance',
    geo: 'US',
    appId: 'Demo Finance 1000000001', // Composite Name + ID
    keyword: 'budget tracker',
    ranking: Math.max(1, 50 - (i * 3) + Math.floor(Math.random() * 5)), // Ranking improving
    installs: 50 + (i * 10) + Math.floor(Math.random() * 20), // Installs increasing
    cpi: 0.09
  })),
  // App 1: Demo Finance (Different Keyword)
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `sb-us-kw2-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'Demo Finance',
    appGroup: 'Demo Finance',
    geo: 'US',
    appId: 'Demo Finance 1000000001',
    keyword: 'expense planner',
    ranking: Math.max(1, 100 - i + Math.floor(Math.random() * 10)),
    installs: 20 + i + Math.floor(Math.random() * 5),
    cpi: 0.12 // Slightly higher CPI for this keyword campaign
  })),
  // App 2: Demo Fitness
  ...Array.from({ length: 14 }).map((_, i) => ({
    id: `fp-uk-${i}`,
    date: formatDate(subDays(today, 13 - i)),
    appName: 'Demo Fitness',
    appGroup: 'Demo Fitness',
    geo: 'UK',
    appId: 'Demo Fitness 1000000002',
    keyword: 'home workout',
    ranking: Math.max(1, 10 + (i % 5)), // Fluctuating rank
    installs: 200 + Math.floor(Math.random() * 50),
    cpi: 0.09
  })),
];
