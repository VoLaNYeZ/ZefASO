export const ALL_TABS_SENTINEL = '__ZEYFASO_ALL_TABS__';

export type TabsSelectionMode = 'legacy_selected' | 'all_except';

export const normalizeStoredTabs = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((t): t is string => typeof t === 'string');
};

export const detectTabsSelectionMode = (storedTabs: string[]): TabsSelectionMode => {
    return storedTabs.includes(ALL_TABS_SENTINEL) ? 'all_except' : 'legacy_selected';
};

export const getExcludedTabsFromStored = (storedTabs: string[]): string[] => {
    return storedTabs.filter(t => t !== ALL_TABS_SENTINEL);
};

export const buildStoredTabsAllExcept = (excludedTabs: string[]): string[] => {
    const uniqueExcluded = Array.from(new Set(excludedTabs.filter(Boolean)));
    return [ALL_TABS_SENTINEL, ...uniqueExcluded];
};

export const resolveTabsToSync = (
    allTabs: string[],
    storedSelectedTabsRaw: unknown
): { tabsToSync: string[]; excludedTabs: string[]; mode: TabsSelectionMode } => {
    const storedSelectedTabs = normalizeStoredTabs(storedSelectedTabsRaw);
    const mode = detectTabsSelectionMode(storedSelectedTabs);

    if (mode === 'all_except') {
        const excludedSet = new Set(getExcludedTabsFromStored(storedSelectedTabs));
        const tabsToSync = allTabs.filter(tab => !excludedSet.has(tab));
        const excludedTabs = allTabs.filter(tab => excludedSet.has(tab));
        return { tabsToSync, excludedTabs, mode };
    }

    const selectedSet = new Set(storedSelectedTabs);
    const tabsToSync = allTabs.filter(tab => selectedSet.has(tab));
    const excludedTabs = allTabs.filter(tab => !selectedSet.has(tab));
    return { tabsToSync, excludedTabs, mode };
};

