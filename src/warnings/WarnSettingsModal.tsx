import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import { DEFAULT_WARNING_RULE_SETTINGS } from './defaults';
import type { WarningRuleId, WarningRuleSetting, WarningsSettings } from './types';
import { saveWarningsSettings } from '../../lib/supabaseService';

type ParamKey =
  | 'stuckDays'
  | 'maxRankDeltaInPeriod'
  | 'minInstallsInPeriod'
  | 'noDataDays'
  | 'warnDelta'
  | 'criticalDelta'
  | 'staleDays';

const RULE_META: Array<{
  id: WarningRuleId;
  title: string;
  params?: Array<{ key: ParamKey; label: string }>;
}> = [
  {
    id: 'ineffective_keyword_stuck',
    title: 'Ineffective keyword stuck',
    params: [
      { key: 'stuckDays', label: 'Stuck days' },
      { key: 'maxRankDeltaInPeriod', label: 'Max rank delta' },
      { key: 'minInstallsInPeriod', label: 'Min installs' },
    ],
  },
  { id: 'rank_improvement_too_small', title: 'Rank improvement too small' },
  { id: 'rank1_reached_but_push_continues', title: 'Rank 1 reached but push continues' },
  { id: 'rank1_lost', title: 'Rank 1 lost' },
  {
    id: 'no_rank_data_during_push',
    title: 'No rank data during push',
    params: [{ key: 'noDataDays', label: 'No data days' }],
  },
  { id: 'install_efficiency_low', title: 'Install efficiency low' },
  {
    id: 'rank_drop_spike',
    title: 'Rank drop spike',
    params: [
      { key: 'warnDelta', label: 'Warn delta' },
      { key: 'criticalDelta', label: 'Critical delta' },
    ],
  },
  {
    id: 'data_stale',
    title: 'Data stale',
    params: [{ key: 'staleDays', label: 'Stale days' }],
  },
];

const clampInt = (value: string, fallback: number): number => {
  if (value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

type DraftRule = {
  enabled: boolean;
  params: Record<string, string>;
};

interface WarnSettingsModalProps {
  appKey: string;
  settings: WarningsSettings;
  setSettings: React.Dispatch<React.SetStateAction<WarningsSettings>>;
  lang: 'en' | 'ru';
  t: any;
  onClose: () => void;
}

export const WarnSettingsModal: React.FC<WarnSettingsModalProps> = ({ appKey, settings, setSettings, lang, t, onClose }) => {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onClose(), 160);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closing]);

  const initialDraft = useMemo((): Record<WarningRuleId, DraftRule> => {
    const savedRules = settings.apps?.[appKey]?.rules || {};
    const out = {} as Record<WarningRuleId, DraftRule>;

    (Object.keys(DEFAULT_WARNING_RULE_SETTINGS) as WarningRuleId[]).forEach((ruleId) => {
      const def = DEFAULT_WARNING_RULE_SETTINGS[ruleId];
      const saved = savedRules[ruleId];
      const enabled = typeof saved?.enabled === 'boolean' ? saved.enabled : def.enabled;
      const mergedParams = { ...(def.params || {}), ...(saved?.params || {}) };
      const params: Record<string, string> = {};
      Object.keys(mergedParams).forEach((k) => {
        params[k] = String((mergedParams as any)[k] ?? '');
      });
      out[ruleId] = { enabled, params };
    });

    return out;
  }, [appKey, settings.apps]);

  const [draft, setDraft] = useState<Record<WarningRuleId, DraftRule>>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ruleMeta = useMemo(() => {
    const ru = lang === 'ru';
    return RULE_META.map((r) => {
      const title = (() => {
        if (!ru) return r.title;
        switch (r.id) {
          case 'ineffective_keyword_stuck': return 'Ключ стоит на месте';
          case 'rank_improvement_too_small': return 'Улучшение позиции слишком маленькое';
          case 'rank1_reached_but_push_continues': return 'Позиция 1 достигнута, но пуш продолжается';
          case 'rank1_lost': return 'Потеряна позиция 1';
          case 'no_rank_data_during_push': return 'Нет данных по позиции во время пуша';
          case 'install_efficiency_low': return 'Низкая эффективность';
          case 'rank_drop_spike': return 'Резкое падение позиции';
          case 'data_stale': return 'Данные устарели';
          default: return r.title;
        }
      })();

      const params = (r.params || []).map((p) => {
        const label = (() => {
          if (!ru) return p.label;
          switch (p.key) {
            case 'stuckDays': return 'Дней без изменений';
            case 'maxRankDeltaInPeriod': return 'Макс. изменение ранка';
            case 'minInstallsInPeriod': return 'Мин. установок';
            case 'noDataDays': return 'Дней без данных';
            case 'warnDelta': return 'Порог warning';
            case 'criticalDelta': return 'Порог critical';
            case 'staleDays': return 'Дней без новых строк';
            default: return p.label;
          }
        })();
        return { ...p, label };
      });

      return { ...r, title, params };
    });
  }, [lang]);

  const updateEnabled = (ruleId: WarningRuleId, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], enabled },
    }));
  };

  const updateParam = (ruleId: WarningRuleId, key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [ruleId]: {
        ...prev[ruleId],
        params: {
          ...prev[ruleId].params,
          [key]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const nextRules: Record<WarningRuleId, WarningRuleSetting> = {} as any;
      (Object.keys(DEFAULT_WARNING_RULE_SETTINGS) as WarningRuleId[]).forEach((ruleId) => {
        const def = DEFAULT_WARNING_RULE_SETTINGS[ruleId];
        const d = draft[ruleId];
        const enabled = !!d?.enabled;
        const paramsOut: Record<string, number> = {};

        const defParams = def.params || {};
        const keys = Object.keys(defParams);
        if (keys.length > 0) {
          keys.forEach((k) => {
            const fallback = (defParams as any)[k] ?? 0;
            const raw = d?.params?.[k] ?? '';
            paramsOut[k] = clampInt(raw, fallback);
          });
          nextRules[ruleId] = { enabled, params: paramsOut };
        } else {
          nextRules[ruleId] = { enabled };
        }
      });

      const next: WarningsSettings = {
        ...settings,
        initialized: true,
        apps: {
          ...(settings.apps || {}),
          [appKey]: {
            ...(settings.apps?.[appKey] || {}),
            rules: {
              ...(settings.apps?.[appKey]?.rules || {}),
              ...nextRules,
            },
          },
        },
      };

      await saveWarningsSettings(next);
      setSettings(next);
      requestClose();
    } catch (e: any) {
      setError(e?.message || (lang === 'ru' ? 'Не удалось сохранить настройки предупреждений' : 'Failed to save warnings settings'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${entered && !closing ? 'opacity-100' : 'opacity-0'}`}
        onClick={requestClose}
      />

      <div
        className={`relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-all duration-200 ease-out ${
          entered && !closing ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{t.warningsSettings || 'Warnings settings'}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{appKey}</p>
          </div>
          <button
            onClick={requestClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t.close || 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 space-y-4">
          {ruleMeta.map((rule) => {
            const d = draft[rule.id];
            const paramKeys = rule.params || [];
            return (
              <div key={rule.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{rule.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 break-all">{rule.id}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 shrink-0">
                    <input
                      type="checkbox"
                      checked={!!d?.enabled}
                      onChange={(e) => updateEnabled(rule.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    {t.warningsEnabled || 'Enabled'}
                  </label>
                </div>

                {paramKeys.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {paramKeys.map((p) => (
                      <label key={p.key} className="text-xs text-slate-600 dark:text-slate-300">
                        <div className="mb-1">{p.label}</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={d?.params?.[p.key] ?? ''}
                          onChange={(e) => updateParam(rule.id, p.key, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="text-sm text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
          <button
            onClick={requestClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {t.cancel || 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 transition-all disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? (lang === 'ru' ? 'Сохранение' : 'Saving') : (t.save || 'Save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
