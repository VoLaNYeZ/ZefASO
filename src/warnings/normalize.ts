export const normalizeAppKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeCategoryName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeAppCategoryMap = (
  map: Record<string, string> | null | undefined,
): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeAppKey(key);
    if (!normalizedKey) return;
    out[normalizedKey] = normalizeCategoryName(value);
  });
  return out;
};

export const normalizeAppKeyList = (values: unknown[] | null | undefined): string[] => {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeAppKey(value))
    .filter(Boolean);
};
