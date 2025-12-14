export type Severity = 'critical' | 'warning' | 'info';

export type WarningRuleId =
  | 'ineffective_keyword_stuck'
  | 'rank_improvement_too_small'
  | 'rank1_reached_but_push_continues'
  | 'rank1_lost'
  | 'no_rank_data_during_push'
  | 'install_efficiency_low'
  | 'rank_drop_spike'
  | 'data_stale';

export type WarningItem = {
  id: string; // `${ruleId}|${appKey}|${geo}|${keyword}`
  ruleId: WarningRuleId;
  severity: Severity;
  appKey: string;
  geo: string;
  keyword: string;
  message: string;
  evidence: Record<string, any>;
  createdFromDate: string; // latest date used for this item
};

export type WarningsFolderSettings = {
  monitorEnabled: boolean;
};

export type WarningRuleSetting = {
  enabled: boolean;
  params?: Record<string, number>;
};

export type WarningsAppSettings = {
  rules: Record<WarningRuleId, WarningRuleSetting>;
};

export type WarningsSettings = {
  initialized?: boolean;
  folders: Record<string, WarningsFolderSettings>;
  apps: Record<string, WarningsAppSettings>; // key = appKey
  ignored?: Record<string, { until?: string }>;
};
