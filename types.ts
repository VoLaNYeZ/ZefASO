
export interface AsoEntry {
  id: string; // Unique record ID
  date: string; // YYYY-MM-DD
  appName: string;
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
