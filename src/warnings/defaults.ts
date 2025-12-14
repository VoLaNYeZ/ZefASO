import type { WarningRuleId, WarningRuleSetting } from './types';

export const DEFAULT_WARNING_RULE_SETTINGS: Record<WarningRuleId, WarningRuleSetting> = {
  ineffective_keyword_stuck: {
    enabled: true,
    params: { stuckDays: 3, maxRankDeltaInPeriod: 1, minInstallsInPeriod: 1 },
  },
  rank_improvement_too_small: { enabled: true },
  rank1_reached_but_push_continues: { enabled: true },
  rank1_lost: { enabled: true },
  no_rank_data_during_push: { enabled: true, params: { noDataDays: 7 } },
  install_efficiency_low: { enabled: true },
  rank_drop_spike: { enabled: true, params: { warnDelta: 10, criticalDelta: 20 } },
  data_stale: { enabled: true, params: { staleDays: 2 } },
};

export const cloneDefaultWarningsRules = (): Record<WarningRuleId, WarningRuleSetting> => {
  const out = {} as Record<WarningRuleId, WarningRuleSetting>;
  (Object.keys(DEFAULT_WARNING_RULE_SETTINGS) as WarningRuleId[]).forEach((ruleId) => {
    const def = DEFAULT_WARNING_RULE_SETTINGS[ruleId];
    out[ruleId] = def.params ? { enabled: def.enabled, params: { ...def.params } } : { enabled: def.enabled };
  });
  return out;
};

