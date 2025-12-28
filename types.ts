
export interface AsoEntry {
  id: string; // Unique record ID
  date: string; // YYYY-MM-DD
  appName: string; // Store app name from sheet
  appGroup: string; // Active App (tab name)
  geo: string;
  appId: string; // The specific AppStore ID
  keyword: string;
  ranking: number;
  installs: number;
  cpi: number; // Cost Per Install
}

export type Granularity = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export interface FilterState {
  appName: string | null;
  appId: string | 'All';
  geo: string | 'All';
  keyword: string | 'All';
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
}

export interface ChartDataPoint {
  date: string;
  installs: number;
  ranking: number;
  cost: number;
  keyword: string;
  collapsedCategories: string[];
}

export interface GoogleSheetSyncConfig {
  user_id: string;
  web_app_url: string;
  is_sync_enabled: boolean;
  is_server_scheduled?: boolean;
  last_synced_at?: string;
  selected_tabs: string[];
}

export interface AppSummary {
  totalInstalls: number;
  avgRanking: number;
  totalCost: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface ComparisonBlock {
  id: string; // Internal ID for the block (uuid)
  appName: string;
  appId: string | 'All';
  geo: string | 'All';
  keyword: string | 'All';
  color: string; // Hex color for identity
  startDate: string | null;
  endDate: string | null;
}

export interface AppAlias {
  id?: string;
  appName: string;
  appId: string;
  prefix: string;
  number: string;
  isPrimary: boolean;
}

export interface CompetitorDetection {
  id: string;
  targetAppName: string;
  targetAppId?: string | null;
  targetBundleId?: string | null;
  candidateKey: string;
  candidateTrackId?: string | null;
  candidateBundleId?: string | null;
  candidateName: string;
  candidateSeller?: string | null;
  candidateGenre?: string | null;
  candidateUrl?: string | null;
  candidateArtworkUrl?: string | null;
  candidateReleaseDate?: string | null;
  candidateUpdateDate?: string | null;
  score: number;
  signals?: any;
  foundIn?: { keyword: string; geo: string; rank: number }[];
  isPotential?: boolean;
  potentialReason?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isIgnored: boolean;
  ignoredAt?: string | null;
}

export interface CompetitorTarget {
  id: string;
  appName: string;
  appId?: string | null;
  bundleId?: string | null;
  keywords: string[];
  geos: string[];
  keywordGeoPairs: string[];
  minScore: number;
  isActive: boolean;
  enablePotential?: boolean;
  updatedAt?: string | null;
}

// Translation type - derived from i18n.ts structure
import { translations } from './i18n';
export type Translations = typeof translations.en;
