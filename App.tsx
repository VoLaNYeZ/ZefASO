
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    LayoutDashboard,
    BarChart2,
    Plus,
    TrendingUp,
    DollarSign,
    Menu,
    BrainCircuit,
    Settings,
    Archive,
    RefreshCw,
    Hash,
    ChevronDown,
    ChevronUp,
    Trash2,
    CalendarClock,
    Globe,
    Search,
    AlertTriangle,
    X,
    ExternalLink,
    Maximize2,
    Minimize2,
    Layout,
    LayoutList,
    FilterX,
    FolderPlus,
    Folder,
    FolderOpen,
    MoreVertical,
    Edit2,
    FolderPen,
    Check,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    LayoutGrid,
    Trophy,
    Flame,
    Award,
    Star,
    Wheat,
    GitCompare,
    FlaskConical,
    Sun,
    Moon,
    Languages,
    LogOut
} from 'lucide-react';
import { INITIAL_DATA } from './constants';
import { AsoEntry, FilterState, Granularity } from './types';
import { translations } from './i18n';
import { DashboardCharts } from './components/DashboardCharts';
import { DataUploadModal } from './components/DataUploadModal';
import { DateRangePicker } from './components/DateRangePicker';
import { analyzeASOTrends } from './services/geminiService';
import { OverviewDashboard } from './components/OverviewDashboard';
import { RealtimeStandings } from './components/RealtimeStandings';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { supabase } from './lib/supabase';
import { LoginPage } from './components/LoginPage';
import { Session } from '@supabase/supabase-js';
import { loadAsoData, saveAsoData, loadAppSettings, saveAppSettings, loadUserPreferences, saveUserPreferences } from './lib/supabaseService';
import { fetchSheetData, processSheetData } from './services/googleSheets';

const App = () => {
    // -- Auth State --
    const [session, setSession] = useState<Session | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // -- State: Data Persistence --
    const [dataLoading, setDataLoading] = useState(true);
    const [data, setData] = useState<AsoEntry[]>([]);
    const [hiddenApps, setHiddenApps] = useState<string[]>([]);
    const [appIcons, setAppIcons] = useState<Record<string, string>>({});
    const [categories, setCategories] = useState<string[]>(['General']);
    const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
    const [appCategoryMap, setAppCategoryMap] = useState<Record<string, string>>({});
    const [lang, setLang] = useState<'en' | 'ru'>('en');
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    // Track if we've already loaded data to prevent reloading on tab switch
    const hasLoadedData = useRef(false);
    const currentUserId = useRef<string | null>(null);

    // Load initial data from Supabase when authenticated
    useEffect(() => {
        if (!session) {
            setDataLoading(false);
            hasLoadedData.current = false;
            currentUserId.current = null;
            return;
        }

        const userId = session.user.id;

        // Only load data if we haven't loaded for this user yet
        if (hasLoadedData.current && currentUserId.current === userId) {
            return;
        }

        const loadInitialData = async () => {
            setDataLoading(true);
            try {
                const [asoData, appSettings, userPrefs] = await Promise.all([
                    loadAsoData(),
                    loadAppSettings(),
                    loadUserPreferences()
                ]);

                setData(asoData.length > 0 ? asoData : INITIAL_DATA);
                setAppIcons(appSettings.appIcons);
                setCategories(appSettings.categories);
                setAppCategoryMap(appSettings.appCategoryMap);
                setCollapsedCategories(appSettings.collapsedCategories);
                setHiddenApps(userPrefs.hiddenApps);
                setLang(userPrefs.lang);
                setTheme(userPrefs.theme);

                hasLoadedData.current = true;
                currentUserId.current = userId;
            } catch (error) {
                console.error('Error loading data from Supabase:', error);
                // Fallback to INITIAL_DATA on error
                setData(INITIAL_DATA);
            } finally {
                setDataLoading(false);
            }
        };

        loadInitialData();
    }, [session]);



    // Save to Supabase whenever data changes (debounced)
    useEffect(() => {
        if (!session || dataLoading) return;
        const timer = setTimeout(() => {
            saveAsoData(data);
        }, 1000); // Debounce saves by 1 second
        return () => clearTimeout(timer);
    }, [data, session, dataLoading]);

    useEffect(() => {
        if (!session || dataLoading) return;
        const timer = setTimeout(() => {
            saveAppSettings({
                appIcons,
                categories,
                appCategoryMap,
                collapsedCategories
            });
        }, 1000);
        return () => clearTimeout(timer);
    }, [appIcons, categories, appCategoryMap, collapsedCategories, session, dataLoading]);

    useEffect(() => {
        if (!session || dataLoading) return;
        const timer = setTimeout(() => {
            saveUserPreferences({ lang, theme, hiddenApps });
        }, 1000);
        return () => clearTimeout(timer);
    }, [lang, theme, hiddenApps, session, dataLoading]);

    // Theme Effects
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // -- Localization Dictionary --
    const t = useMemo(() => {
        return translations[lang];
    }, [lang]);

    // -- UI State --
    const [currentPage, setCurrentPage] = useState<'dashboard' | 'overview' | 'lab'>('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isHiddenSectionOpen, setIsHiddenSectionOpen] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [deleteAllConfirmation, setDeleteAllConfirmation] = useState(false);
    const [viewMode, setViewMode] = useState<'full' | 'mini'>('mini');

    // UI State for Moving Apps
    const [movingApp, setMovingApp] = useState<string | null>(null); // The app currently being moved

    // CPI Management State
    const [cpiInput, setCpiInput] = useState<string>('0.09');
    const [cpiConfirmation, setCpiConfirmation] = useState<number | null>(null);
    const [showCpiSuccess, setShowCpiSuccess] = useState(false);

    // -- Category Modal State --
    const [categoryModal, setCategoryModal] = useState<{
        isOpen: boolean;
        mode: 'create' | 'rename' | 'delete';
        targetName: string;
        inputValue: string;
    }>({
        isOpen: false,
        mode: 'create',
        targetName: '',
        inputValue: ''
    });

    // -- Granularity State --
    const [granularity, setGranularity] = useState<Granularity>('Daily');

    // -- App Resolution Logic (Merge by ID) --
    const appResolution = useMemo(() => {
        const idToName: Record<string, string> = {};
        const nameToId: Record<string, string> = {};
        const idToLatestDate: Record<string, string> = {};

        // 1. Find the latest name for each App ID
        data.forEach(item => {
            if (!item.appId) return;

            const existingDate = idToLatestDate[item.appId];
            if (!existingDate || item.date > existingDate) {
                idToLatestDate[item.appId] = item.date;
                idToName[item.appId] = item.appName;
            }
        });

        // 2. Build reverse map
        Object.entries(idToName).forEach(([id, name]) => {
            nameToId[name] = id;
        });

        return { idToName, nameToId };
    }, [data]);

    // -- Derived Data --
    const uniqueApps = useMemo(() => {
        // Return only the canonical names (values of idToName)
        // If an app has no ID (legacy?), fallback to its name
        const withIds = new Set(Object.values(appResolution.idToName));
        const withoutIds = data.filter(d => !d.appId).map(d => d.appName);

        return Array.from(new Set([...withIds, ...withoutIds])).sort();
    }, [data, appResolution]);

    const activeApps = useMemo(() => uniqueApps.filter(app => !hiddenApps.includes(app)), [uniqueApps, hiddenApps]);
    const archivedAppsList = useMemo(() => uniqueApps.filter(app => hiddenApps.includes(app)), [uniqueApps, hiddenApps]);

    // Create a Set of existing composite keys for quick duplicate checking
    const existingDataKeys = useMemo(() => {
        return new Set(data.map(item => `${item.date}-${item.appId}-${item.geo}-${item.keyword}`));
    }, [data]);

    // Group Active Apps by Category
    const groupedApps = useMemo(() => {
        const groups: Record<string, string[]> = {};
        categories.forEach(c => groups[c] = []);
        groups['Uncategorized'] = [];

        activeApps.forEach(app => {
            const cat = appCategoryMap[app];
            if (cat && categories.includes(cat)) {
                groups[cat].push(app);
            } else {
                groups['Uncategorized'].push(app);
            }
        });
        return groups;
    }, [activeApps, categories, appCategoryMap]);


    // Global Filter State
    const [filters, setFilters] = useState<FilterState>({
        appName: null,
        appId: 'All',
        geo: 'All',
        keyword: 'All',
        startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default last 30 days
        endDate: new Date().toISOString().split('T')[0]
    });

    // Ensure a valid app is selected on load or after archiving
    useEffect(() => {
        if (!filters.appName || !activeApps.includes(filters.appName)) {
            if (activeApps.length > 0) {
                setFilters(prev => ({
                    ...prev,
                    appName: activeApps[0],
                    appId: 'All',
                    geo: 'All',
                    keyword: 'All'
                }));
            } else if (archivedAppsList.length > 0 && !filters.appName) {
                // Fallback to viewing an archived app if no active ones exist
                setFilters(prev => ({ ...prev, appName: archivedAppsList[0] }));
            }
        }
    }, [activeApps, archivedAppsList, filters.appName]);

    // Calculate Latest CPI for selected app
    const latestCPI = useMemo(() => {
        if (!filters.appName) return '0.09';

        const selectedAppId = appResolution.nameToId[filters.appName];

        // Filter by ID if possible
        const appEntries = data.filter(d => selectedAppId ? d.appId === selectedAppId : d.appName === filters.appName);

        if (appEntries.length === 0) return '0.09';
        // Find entry with latest date
        const latest = appEntries.reduce((prev, current) => (prev.date > current.date) ? prev : current);
        return latest.cpi.toString();
    }, [data, filters.appName, appResolution]);

    // Sync input with latest CPI
    useEffect(() => {
        setCpiInput(latestCPI);
    }, [latestCPI]);


    // Reset AI Analysis when filters change to avoid showing stale data
    useEffect(() => {
        setAiAnalysis(null);
    }, [filters.appName, filters.appId, filters.geo, filters.keyword, filters.startDate, filters.endDate, granularity]);

    // Secondary Filters Options
    const availableAppIds = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => d.appName === filters.appName)
            .map(d => d.appId)));
    }, [data, filters.appName]);

    const availableGeos = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => d.appName === filters.appName)
            .map(d => d.geo)));
    }, [data, filters.appName]);

    const availableKeywords = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => d.appName === filters.appName && (filters.geo === 'All' || d.geo === filters.geo))
            .map(d => d.keyword)));
    }, [data, filters.appName, filters.geo]);

    // -- Preview Geo State --
    // This controls the GEO for the App Store link independently of the dashboard filter
    const [previewGeo, setPreviewGeo] = useState('US');

    // Sync previewGeo with filter geo if specific
    useEffect(() => {
        if (filters.geo !== 'All') {
            setPreviewGeo(filters.geo);
        } else if (availableGeos.length > 0 && !availableGeos.includes(previewGeo)) {
            // If switching to All, default to the first available geo if the current preview isn't valid
            setPreviewGeo(availableGeos[0]);
        } else if (availableGeos.length === 0) {
            setPreviewGeo('US');
        }
    }, [filters.geo, availableGeos]);

    // Extract Numeric ID from the composite "Name ID" string
    const currentNumericId = useMemo(() => {
        let rawId = '';
        if (filters.appId !== 'All') {
            rawId = filters.appId;
        } else if (filters.appName) {
            // Find the latest App ID for the selected App Name based on date
            const appEntries = data.filter(d => d.appName === filters.appName);
            if (appEntries.length > 0) {
                // Sort by date descending to get the most recent entry
                const latestEntry = appEntries.reduce((prev, current) =>
                    (prev.date > current.date) ? prev : current
                );
                rawId = latestEntry.appId;
            }
        }
        // Extract numbers from strings like "App Name 123456"
        const match = rawId.match(/(\d+)/);
        return match ? match[0] : null;
    }, [filters.appId, filters.appName, data]);

    // -- Fetch App Icon Effect --
    useEffect(() => {
        const fetchIcon = async () => {
            // Skip if no app selected or no ID found
            if (!filters.appName || !currentNumericId) return;

            // 1. Collect countries to try based on data
            const countriesToTry = new Set<string>();
            // Always try US first as it's the biggest store
            countriesToTry.add('US');

            availableGeos.forEach(g => {
                // Map common codes to ISO
                const code = g.toUpperCase();
                if (code === 'UK') countriesToTry.add('GB');
                else if (code.length === 2) countriesToTry.add(code);
            });

            // 2. Iterate and try to fetch
            for (const country of Array.from(countriesToTry)) {
                try {
                    // iTunes Lookup API
                    const targetUrl = `https://itunes.apple.com/lookup?id=${currentNumericId}&country=${country}`;
                    // Use allorigins.win as a more reliable CORS proxy
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

                    const response = await fetch(proxyUrl);
                    if (response.ok) {
                        const data = await response.json();
                        // allorigins returns the actual content in 'contents' field
                        const itunesData = JSON.parse(data.contents);

                        if (itunesData.resultCount > 0) {
                            const result = itunesData.results[0];
                            const iconUrl = result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60;

                            // Only update if the icon is different to avoid loops/unnecessary saves
                            if (iconUrl && iconUrl !== appIcons[filters.appName]) {
                                setAppIcons(prev => ({ ...prev, [filters.appName!]: iconUrl }));
                            }
                            return; // Stop once found
                        }
                    }
                } catch (e) {
                    console.warn(`Icon fetch failed for ${country}`, e);
                }
            }
        };

        fetchIcon();
    }, [filters.appName, currentNumericId, availableGeos, appIcons]);


    const getStoreUrl = (geo: string, id: string) => {
        // Map custom codes to Apple Store ISO codes
        const isoMap: Record<string, string> = { 'UK': 'gb', 'EN': 'gb' };
        const code = (isoMap[geo] || geo).toLowerCase();
        return `https://apps.apple.com/${code}/app/id${id}`;
    };

    // -- Filter Data Logic --
    const filteredData = useMemo(() => {
        if (!filters.appName) return [];

        // Resolve selected name to ID
        const selectedAppId = appResolution.nameToId[filters.appName];

        let res = data.filter(item => {
            // Filter by ID if we have one (merging duplicates), otherwise fallback to name
            if (selectedAppId) {
                if (item.appId !== selectedAppId) return false;
            } else {
                if (item.appName !== filters.appName) return false;
            }

            if (filters.appId !== 'All' && item.appId !== filters.appId) return false;
            if (filters.geo !== 'All' && item.geo !== filters.geo) return false;
            if (filters.keyword !== 'All' && item.keyword !== filters.keyword) return false;
            return true;
        });

        // Date Filtering
        if (filters.startDate && filters.endDate) {
            // String comparison works for YYYY-MM-DD format
            res = res.filter(item => item.date >= filters.startDate! && item.date <= filters.endDate!);
        }

        // Explicitly sort correctly by date
        return res.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data, filters]);

    // Summary Logic
    const summary = useMemo(() => {
        if (filteredData.length === 0) return { installs: 0, rank: 0, cost: 0, keywordCount: 0, geoCount: 0 };

        const totalInstalls = filteredData.reduce((acc, curr) => acc + curr.installs, 0);
        const totalCost = filteredData.reduce((acc, curr) => acc + (curr.installs * curr.cpi), 0);

        // Snapshot Average Rank Calculation
        // We want the average of the "latest available" rank for each keyword/geo pair within the filtered period.
        const latestRanksMap = new Map<string, number>();
        const uniqueKWs = new Set<string>();
        const uniqueGeos = new Set<string>();

        filteredData.forEach(item => {
            if (item.ranking > 0) {
                // Composite key for unique tracking entity
                // Using a separator that is unlikely to be in keyword or geo
                const key = `${item.geo}__||__${item.keyword}`;
                // Since filteredData is sorted by date ascending, this will overwrite older entries
                // leaving us with the rank on the latest date present in the data
                latestRanksMap.set(key, item.ranking);
            }
        });

        // Determine unique counts from the valid ranked items
        for (const key of latestRanksMap.keys()) {
            const [geo, ...kwParts] = key.split('__||__');
            const kw = kwParts.join('__||__');
            if (geo) uniqueGeos.add(geo);
            if (kw) uniqueKWs.add(kw);
        }

        const validLatestRanks = Array.from(latestRanksMap.values());
        const avgRank = validLatestRanks.length > 0
            ? Math.round(validLatestRanks.reduce((acc, curr) => acc + curr, 0) / validLatestRanks.length)
            : 0;

        return {
            installs: totalInstalls,
            rank: avgRank,
            cost: totalCost,
            keywordCount: uniqueKWs.size,
            geoCount: uniqueGeos.size
        };
    }, [filteredData]);

    // -- Helpers --

    const getCountryFlag = (geoCode: string) => {
        const code = geoCode.toUpperCase();
        // Correct mapping for United Kingdom from non-standard "UK" to ISO "GB"
        const isoMap: Record<string, string> = {
            'UK': 'GB',
            'EN': 'GB',
        };
        const target = isoMap[code] || code;

        if (target === 'ALL') return 'https://flagcdn.com/w20/un.png'; // Use UN flag for World/All
        if (target.length !== 2) return 'https://flagcdn.com/w20/un.png';

        return `https://flagcdn.com/w20/${target.toLowerCase()}.png`;
    };

    const handleAddData = (newEntries: AsoEntry[]) => {
        setData(prev => {
            // Create a map of existing entries using a composite key to handle duplicates
            const dataMap = new Map();

            // Load existing
            prev.forEach(item => {
                const key = `${item.date}-${item.appId}-${item.geo}-${item.keyword}`;
                dataMap.set(key, item);
            });

            // Merge new (overwrite if exists)
            newEntries.forEach(item => {
                const key = `${item.date}-${item.appId}-${item.geo}-${item.keyword}`;
                dataMap.set(key, item);
            });

            return Array.from(dataMap.values());
        });
    };

    // -- Automatic Google Sheets Sync --
    useEffect(() => {
        if (!session || !currentUserId.current) return;

        const runSync = async () => {
            try {
                const { data: syncSettings, error } = await supabase
                    .from('google_sheets_sync')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .single();

                if (error || !syncSettings || !syncSettings.is_sync_enabled) return;

                const lastSynced = syncSettings.last_synced_at ? new Date(syncSettings.last_synced_at) : null;
                const today = new Date();
                const isSameDay = lastSynced &&
                    lastSynced.getDate() === today.getDate() &&
                    lastSynced.getMonth() === today.getMonth() &&
                    lastSynced.getFullYear() === today.getFullYear();

                if (isSameDay) return; // Already synced today

                console.log("Running automatic Google Sheets sync...");
                const tabs = syncSettings.selected_tabs as string[];
                if (!tabs || tabs.length === 0) return;

                let newEntries: AsoEntry[] = [];

                for (const tab of tabs) {
                    try {
                        const sheetData = await fetchSheetData(syncSettings.web_app_url, tab);
                        const entries = processSheetData(sheetData, tab);
                        newEntries = [...newEntries, ...entries];
                    } catch (e) {
                        console.error(`Failed to sync tab ${tab}:`, e);
                    }
                }

                if (newEntries.length > 0) {
                    handleAddData(newEntries); // Merge into state

                    // Update last_synced_at
                    await supabase
                        .from('google_sheets_sync')
                        .update({ last_synced_at: new Date().toISOString() })
                        .eq('user_id', session.user.id);

                    console.log(`Synced ${newEntries.length} entries from Google Sheets.`);
                }

            } catch (err) {
                console.error("Auto-sync failed:", err);
            }
        };

        // Run sync shortly after load to avoid blocking initial render
        const timer = setTimeout(runSync, 3000);
        return () => clearTimeout(timer);
    }, [session]);

    const handleRequestCPIUpdate = () => {
        if (!filters.appName) return;
        const newCPI = parseFloat(cpiInput);
        if (isNaN(newCPI) || newCPI < 0) {
            alert("Please enter a valid price.");
            return;
        }
        setCpiConfirmation(newCPI);
    };

    const confirmUpdateCPI = () => {
        if (cpiConfirmation === null || !filters.appName) return;

        setData(prev => prev.map(item =>
            item.appName === filters.appName
                ? { ...item, cpi: cpiConfirmation }
                : item
        ));

        setCpiConfirmation(null);
        setShowCpiSuccess(true);
        setTimeout(() => setShowCpiSuccess(false), 3000);
    };

    const requestDeleteApp = () => {
        if (filters.appName) {
            setDeleteConfirmation(filters.appName);
        }
    };

    const confirmDeleteApp = () => {
        if (!deleteConfirmation) return;

        const appName = deleteConfirmation;
        const appIdToDelete = appResolution.nameToId[appName];

        // Filter out all entries for this app (by ID if possible, else Name)
        const newData = data.filter(d => appIdToDelete ? d.appId !== appIdToDelete : d.appName !== appName);
        setData(newData);

        // Remove from hidden list if present
        setHiddenApps(prev => prev.filter(app => app !== appName));

        // Remove icon
        const newIcons = { ...appIcons };
        delete newIcons[appName];
        setAppIcons(newIcons);

        // Remove from category map
        const newCatMap = { ...appCategoryMap };
        delete newCatMap[appName];
        setAppCategoryMap(newCatMap);

        // Switch filter to another app if possible
        const remainingApps = Array.from(new Set(newData.map(d => d.appName)));

        setDeleteConfirmation(null); // Close modal

        // Reset filters for remaining apps
        if (remainingApps.length > 0) {
            setFilters(prev => ({
                ...prev,
                appName: remainingApps[0],
                appId: 'All',
                geo: 'All',
                keyword: 'All'
            }));
        } else {
            setFilters(prev => ({
                ...prev,
                appName: null,
                appId: 'All',
                geo: 'All',
                keyword: 'All'
            }));
        }
    };

    const requestDeleteAllApps = () => {
        setDeleteAllConfirmation(true);
    };

    const confirmDeleteAllApps = () => {
        if (!filters.appName) return;

        const appNameToDelete = filters.appName;

        // Wipe ALL data for this specific app name (regardless of ID)
        setData(prev => prev.filter(d => d.appName !== appNameToDelete));

        // Remove icon
        const newIcons = { ...appIcons };
        delete newIcons[appNameToDelete];
        setAppIcons(newIcons);

        // Remove from categories
        setCategories(prev => prev); // Categories themselves don't need changing, just the map
        const newCatMap = { ...appCategoryMap };
        delete newCatMap[appNameToDelete];
        setAppCategoryMap(newCatMap);

        // Remove from hidden apps
        setHiddenApps(prev => prev.filter(app => app !== appNameToDelete));

        // Reset filters
        setFilters({
            appName: null,
            appId: 'All',
            geo: 'All',
            keyword: 'All',
            startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        });

        setDeleteAllConfirmation(false);
    };

    const handleToggleArchive = (e: React.MouseEvent, appToToggle: string) => {
        e.stopPropagation();
        setHiddenApps(prev => {
            if (prev.includes(appToToggle)) {
                // Restore
                return prev.filter(app => app !== appToToggle);
            } else {
                // Archive
                return [...prev, appToToggle];
            }
        });
    };

    const resetAllFilters = () => {
        setFilters(prev => ({
            ...prev,
            appId: 'All',
            geo: 'All',
            keyword: 'All',
            startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        }));
        setGranularity('Daily');
    };

    const runAnalysis = async () => {
        setIsAnalyzing(true);
        setAiAnalysis(null);
        const result = await analyzeASOTrends(
            filteredData,
            filters.appName || 'Unknown',
            filters.geo,
            filters.keyword
        );
        setAiAnalysis(result);
        setIsAnalyzing(false);
    };

    // -- Category Management Handlers (Using Modal) --
    const openCreateCategory = () => {
        setCategoryModal({ isOpen: true, mode: 'create', targetName: '', inputValue: '' });
    };

    const openRenameCategory = (name: string) => {
        setCategoryModal({ isOpen: true, mode: 'rename', targetName: name, inputValue: name });
    };

    const openDeleteCategory = (name: string) => {
        setCategoryModal({ isOpen: true, mode: 'delete', targetName: name, inputValue: '' });
    };

    const toggleCategoryCollapse = (category: string) => {
        setCollapsedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const moveCategory = (index: number, direction: 'up' | 'down') => {
        const newCategories = [...categories];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Boundary checks
        if (targetIndex < 0 || targetIndex >= newCategories.length) return;

        // Swap
        [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
        setCategories(newCategories);
    };

    const handleCategoryModalSubmit = () => {
        const { mode, inputValue, targetName } = categoryModal;
        const cleanValue = inputValue.trim();

        if (mode === 'create') {
            if (!cleanValue) return;
            if (categories.includes(cleanValue)) {
                alert("Folder already exists.");
                return;
            }
            setCategories(prev => [...prev, cleanValue]);
        }

        if (mode === 'rename') {
            if (!cleanValue) return;
            if (cleanValue !== targetName && categories.includes(cleanValue)) {
                alert("Folder name already taken.");
                return;
            }
            setCategories(prev => prev.map(c => c === targetName ? cleanValue : c));
            // Update mappings
            const newMap = { ...appCategoryMap };
            Object.keys(newMap).forEach(app => {
                if (newMap[app] === targetName) {
                    newMap[app] = cleanValue;
                }
            });
            setAppCategoryMap(newMap);
        }

        if (mode === 'delete') {
            setCategories(prev => prev.filter(c => c !== targetName));
            // Move apps to uncategorized
            const newMap = { ...appCategoryMap };
            Object.keys(newMap).forEach(app => {
                if (newMap[app] === targetName) {
                    delete newMap[app];
                }
            });
            setAppCategoryMap(newMap);
        }

        setCategoryModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleMoveApp = (app: string, category: string) => {
        setAppCategoryMap(prev => ({
            ...prev,
            [app]: category
        }));
        setMovingApp(null);
    };

    const handleAppSelect = (app: string) => {
        setCurrentPage('dashboard');
        setFilters(prev => ({
            ...prev,
            appName: app,
            appId: 'All',
            geo: 'All',
            keyword: 'All'
        }));
        // On mobile close sidebar
        if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (authLoading || dataLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!session) {
        return <LoginPage />;
    }

    return (
        <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-200 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {/* Mobile Sidebar Toggle */}
            {!isSidebarOpen && (
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 rounded-md shadow-md md:hidden text-slate-700 dark:text-slate-200"
                >
                    <Menu size={20} />
                </button>
            )}

            {/* Sidebar */}
            <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0
      `}>
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight cursor-pointer" onClick={() => setCurrentPage('dashboard')}>
                        <LayoutDashboard className="text-indigo-500" />
                        <span>ZeyfASO</span>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden">
                        <Menu size={20} />
                    </button>
                </div>

                <div className="p-4 shrink-0 space-y-2">
                    {/* Global Overview Button */}
                    <button
                        onClick={() => setCurrentPage('overview')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${currentPage === 'overview'
                            ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                    >
                        <LayoutGrid size={20} className="shrink-0" />
                        <div className="flex flex-col">
                            <span className="font-bold leading-none">{t.overview}</span>
                            <span className={`text-[10px] mt-1 ${currentPage === 'overview' ? 'text-fuchsia-100' : 'text-slate-500'}`}>{t.overviewSub}</span>
                        </div>
                    </button>

                    {/* The Lab Button */}
                    <button
                        onClick={() => setCurrentPage('lab')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${currentPage === 'lab'
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                    >
                        <FlaskConical size={20} className="shrink-0" />
                        <div className="flex flex-col">
                            <span className="font-bold leading-none">{t.theLab}</span>
                            <span className={`text-[10px] mt-1 ${currentPage === 'lab' ? 'text-indigo-100' : 'text-slate-500'}`}>{t.labSub}</span>
                        </div>
                    </button>

                    <div className="flex items-center gap-3 px-3 mt-4 mb-1">
                        <div className="h-px bg-slate-800 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{t.activeApps}</span>
                        <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                </div>

                {/* Active Apps List - Scrollable with Categories */}
                <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {activeApps.length === 0 && (
                        <div className="px-3 py-4 text-sm text-slate-600 italic">{t.noActiveApps}</div>
                    )}

                    {/* Render Defined Categories */}
                    {categories.map((category, index) => {
                        const apps = groupedApps[category] || [];
                        const isCollapsed = collapsedCategories.includes(category);
                        const isFirst = index === 0;
                        const isLast = index === categories.length - 1;

                        return (
                            <div key={category} className="mb-4">
                                {/* Folder Header - Buttons visible on hover (group) */}
                                <div
                                    className="group flex items-center justify-between px-3 mb-1 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors cursor-pointer"
                                    onClick={() => toggleCategoryCollapse(category)}
                                >
                                    <div className="flex items-center gap-1.5 truncate">
                                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                        {/* <FolderOpen size={12} className="shrink-0" /> */}
                                        <span className="truncate">{category}</span>
                                    </div>
                                    {/* Folder Actions - always keep visible to prevent click issues, style as subtle */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveCategory(index, 'up'); }}
                                            disabled={isFirst}
                                            className={`p-1 rounded transition-colors ${isFirst ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                            title="Move Up"
                                        >
                                            <ArrowUp size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveCategory(index, 'down'); }}
                                            disabled={isLast}
                                            className={`p-1 rounded transition-colors ${isLast ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                            title="Move Down"
                                        >
                                            <ArrowDown size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openRenameCategory(category); }}
                                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                            title="Rename Folder"
                                        >
                                            <Edit2 size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openDeleteCategory(category); }}
                                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                            title="Delete Folder"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>

                                {!isCollapsed && (
                                    <div className="space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                        {apps.length === 0 && (
                                            <div className="px-3 py-1.5 text-xs text-slate-700 italic opacity-50 border-l border-slate-800 ml-2 pl-2">
                                                {t.empty}
                                            </div>
                                        )}
                                        {apps.map(app => (
                                            <div
                                                key={app}
                                                onClick={() => handleAppSelect(app)}
                                                className={`group relative w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filters.appName === app && currentPage === 'dashboard'
                                                    ? 'bg-slate-800 text-white shadow-md'
                                                    : 'hover:bg-slate-800/50 hover:text-white'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                    {/* Icon or Dot */}
                                                    {appIcons[app] ? (
                                                        <img src={appIcons[app]} alt="" className="w-5 h-5 rounded-md object-cover shrink-0 bg-white" />
                                                    ) : (
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-indigo-500' : 'bg-slate-600'}`} />
                                                    )}
                                                    <span className="truncate font-medium">{app}</span>
                                                </div>

                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {/* Move Folder Dropdown Trigger */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setMovingApp(movingApp === app ? null : app); }}
                                                            className={`p-1.5 rounded-md transition-colors ${movingApp === app ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                                                            title="Move to Folder"
                                                        >
                                                            <Folder size={14} />
                                                        </button>

                                                        {movingApp === app && (
                                                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl z-50 py-1 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 dark:bg-slate-800 dark:border-slate-700">
                                                                <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700">Move to...</div>
                                                                {categories.filter(c => c !== category).map(c => (
                                                                    <button
                                                                        key={c}
                                                                        onClick={(e) => { e.stopPropagation(); handleMoveApp(app, c); }}
                                                                        className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                                    >
                                                                        <Folder size={12} /> {c}
                                                                    </button>
                                                                ))}
                                                                {/* Allow moving to Uncategorized explicitly if currently categorized */}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleMoveApp(app, ''); }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                                >
                                                                    <Layout size={12} /> {t.uncategorized}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {/* Overlay to close dropdown if clicking outside */}
                                                        {movingApp === app && (
                                                            <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMovingApp(null); }} />
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={(e) => handleToggleArchive(e, app)}
                                                        className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-all"
                                                        title="Archive App"
                                                    >
                                                        <Archive size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Uncategorized Apps */}
                    {groupedApps['Uncategorized'].length > 0 && (
                        <div className="mb-4">
                            <div
                                className="px-3 mb-1 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:text-slate-300 transition-colors"
                                onClick={() => toggleCategoryCollapse('Uncategorized')}
                            >
                                {collapsedCategories.includes('Uncategorized') ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                <span className="truncate">{t.uncategorized}</span>
                            </div>

                            {!collapsedCategories.includes('Uncategorized') && (
                                <div className="space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                    {groupedApps['Uncategorized'].map(app => (
                                        <div
                                            key={app}
                                            onClick={() => handleAppSelect(app)}
                                            className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filters.appName === app && currentPage === 'dashboard'
                                                ? 'bg-slate-800 text-white shadow-md'
                                                : 'hover:bg-slate-800/50 hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                {appIcons[app] ? (
                                                    <img src={appIcons[app]} alt="" className="w-5 h-5 rounded-md object-cover shrink-0 bg-white" />
                                                ) : (
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-indigo-500' : 'bg-slate-600'}`} />
                                                )}
                                                <span className="truncate font-medium">{app}</span>
                                            </div>

                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {/* Move Logic for Uncategorized */}
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMovingApp(movingApp === app ? null : app); }}
                                                        className={`p-1.5 rounded-md transition-colors ${movingApp === app ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                                                        title="Move to Folder"
                                                    >
                                                        <FolderPlus size={14} />
                                                    </button>

                                                    {movingApp === app && (
                                                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl z-50 py-1 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 dark:bg-slate-800 dark:border-slate-700">
                                                            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700">Move to...</div>
                                                            {categories.map(c => (
                                                                <button
                                                                    key={c}
                                                                    onClick={(e) => { e.stopPropagation(); handleMoveApp(app, c); }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                                >
                                                                    <Folder size={12} /> {c}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {movingApp === app && (
                                                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMovingApp(null); }} />
                                                    )}
                                                </div>

                                                <button
                                                    onClick={(e) => handleToggleArchive(e, app)}
                                                    className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-all"
                                                    title="Archive App"
                                                >
                                                    <Archive size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Bottom Actions Area */}
                <div className="shrink-0 bg-slate-900 border-t border-slate-800 p-4 space-y-4 z-10">

                    {/* Hidden / Archived Section */}
                    {archivedAppsList.length > 0 && (
                        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 overflow-hidden">
                            <button
                                onClick={() => setIsHiddenSectionOpen(!isHiddenSectionOpen)}
                                className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2 hover:bg-slate-800 transition-colors"
                            >
                                <span>{t.hiddenArchived} ({archivedAppsList.length})</span>
                                {isHiddenSectionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isHiddenSectionOpen && (
                                <nav className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 p-2 space-y-1 bg-slate-900/50">
                                    {archivedAppsList.map(app => (
                                        <div
                                            key={app}
                                            onClick={() => handleAppSelect(app)}
                                            className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer opacity-70 hover:opacity-100 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-slate-800/50 text-white' : 'text-slate-400 hover:bg-slate-800/30'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                {appIcons[app] ? (
                                                    <img src={appIcons[app]} alt="" className="w-4 h-4 rounded object-cover shrink-0 grayscale group-hover:grayscale-0 transition-all" />
                                                ) : (
                                                    <Archive size={12} className="shrink-0" />
                                                )}
                                                <span className="truncate">{app}</span>
                                            </div>

                                            <button
                                                onClick={(e) => handleToggleArchive(e, app)}
                                                className="p-1.5 hover:bg-indigo-900/50 text-indigo-400 hover:text-indigo-300 rounded-md transition-colors"
                                                title="Restore App"
                                            >
                                                <RefreshCw size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </nav>
                            )}
                        </div>
                    )}

                    {/* Add Data & Folder Buttons */}
                    <div className="flex items-center gap-2">
                        {/* New Folder Button */}
                        <button
                            onClick={() => setCategoryModal({ isOpen: true, mode: 'create', targetName: '', inputValue: '' })}
                            className="shrink-0 w-12 min-h-[3rem] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all active:scale-95"
                            title={t.createCategory}
                        >
                            <FolderPlus size={20} />
                        </button>

                        {/* Add Data Button */}
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex-1 min-h-[3rem] flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-2 py-1 rounded-xl font-bold text-xs leading-tight text-center whitespace-normal transition-all shadow-lg shadow-indigo-900/20 active:scale-95 border border-indigo-500/20"
                        >
                            <Plus size={16} className="shrink-0" />
                            <span>{t.addNewData}</span>
                        </button>
                    </div>

                    {/* Language & Theme Controls */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/50">
                        {/* Language Switch */}
                        <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                            <button
                                onClick={() => setLang('en')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${lang === 'en' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLang('ru')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${lang === 'ru' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                RU
                            </button>
                        </div>

                        {/* Theme Switch */}
                        <button
                            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                            className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                        >
                            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                    </div>
                </div>

                {/* Footer Area */}
                <div className="px-4 py-3 bg-slate-950 text-xs text-slate-600 shrink-0 border-t border-slate-900 flex items-center justify-between">
                    <span>{t.footer}</span>
                    <button
                        onClick={handleLogout}
                        className="p-1 hover:bg-slate-800 text-slate-600 hover:text-red-400 rounded transition-colors"
                        title="Sign Out"
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-slate-50 dark:bg-slate-950 transition-colors duration-200">

                {currentPage === 'overview' ? (
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                        <OverviewDashboard
                            data={data}
                            appIcons={appIcons}
                            categories={categories}
                            appCategoryMap={appCategoryMap}
                            getCountryFlag={getCountryFlag}
                            getStoreUrl={getStoreUrl}
                            theme={theme}
                            t={t}
                        />
                    </div>
                ) : currentPage === 'lab' ? (
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                        <ComparisonDashboard
                            data={data}
                            activeApps={activeApps}
                            getCountryFlag={getCountryFlag}
                            theme={theme}
                            t={t}
                        />
                    </div>
                ) : (
                    <>
                        {/* Dashboard Header */}
                        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20 transition-colors duration-200">
                            <div className="px-4 py-3 pt-16 md:pt-4">
                                <div className="flex flex-row items-center justify-between gap-2 mb-3">
                                    <div className="min-w-0 flex-1">
                                        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 md:gap-3 truncate">
                                            {/* Main Header Icon */}
                                            {filters.appName && appIcons[filters.appName] && (
                                                <img
                                                    src={appIcons[filters.appName]}
                                                    alt={`${filters.appName} icon`}
                                                    className="w-8 h-8 md:w-10 md:h-10 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm object-cover shrink-0"
                                                />
                                            )}
                                            <span className="truncate">{filters.appName || t.dashboard}</span>
                                        </h1>

                                        {/* App Store Link Section - Hidden on very small screens if needed, or kept compact */}
                                        {filters.appName && currentNumericId && (
                                            <div className="hidden sm:flex items-center gap-3 mt-1 text-sm ml-[2.75rem] md:ml-[3.25rem]">
                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t.store}:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {availableGeos.map(geo => (
                                                        <a
                                                            key={geo}
                                                            href={getStoreUrl(geo, currentNumericId)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="opacity-70 hover:opacity-100 hover:scale-110 transition-all"
                                                            title={`Open in ${geo} App Store`}
                                                        >
                                                            <img
                                                                src={getCountryFlag(geo)}
                                                                alt={geo}
                                                                className="w-5 h-3.5 object-contain shadow-sm rounded-[2px]"
                                                            />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* View Toggle */}
                                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <button
                                                onClick={() => setViewMode('mini')}
                                                className={`p-1.5 rounded-md transition-all ${viewMode === 'mini' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                title="Mini View"
                                            >
                                                <Layout size={16} />
                                            </button>
                                            <button
                                                onClick={() => setViewMode('full')}
                                                className={`p-1.5 rounded-md transition-all ${viewMode === 'full' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                title="Full View"
                                            >
                                                <LayoutList size={16} />
                                            </button>
                                        </div>

                                        <button
                                            onClick={runAnalysis}
                                            disabled={isAnalyzing || filteredData.length === 0}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                        >
                                            <BrainCircuit size={16} />
                                            <span className="hidden sm:inline">{isAnalyzing ? t.analyzing : t.aiAnalysis}</span>
                                            <span className="sm:hidden">{t.aiAnalysis.split(' ')[0]}</span> {/* Show shorter text on mobile */}
                                        </button>
                                    </div>
                                </div>

                                {/* Filters Bar - Adaptive Layout */}
                                <div className="grid grid-cols-2 lg:flex lg:flex-row gap-2 items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">

                                    {/* App ID Select */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <Hash size={14} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm truncate"
                                            value={filters.appId}
                                            onChange={(e) => setFilters(prev => ({ ...prev, appId: e.target.value }))}
                                            style={{ minWidth: '0' }}
                                        >
                                            <option value="All">{t.allIds}</option>
                                            {availableAppIds.map(id => (
                                                <option key={id} value={id}>{id}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* GEO Select (With Flags) */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none z-10">
                                            <Globe size={14} />
                                        </div>

                                        {/* Custom Visual Display for Selected Value */}
                                        <div className="w-full lg:w-auto min-w-0 pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-1.5 truncate">
                                            {filters.geo === 'All' ? (
                                                <span className="truncate">🌍 All GEOs</span>
                                            ) : (
                                                <>
                                                    <img
                                                        src={getCountryFlag(filters.geo)}
                                                        alt={filters.geo}
                                                        className="w-4 h-3 object-contain rounded-[2px] shrink-0"
                                                    />
                                                    <span className="truncate">{filters.geo}</span>
                                                </>
                                            )}
                                        </div>

                                        <select
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                            value={filters.geo}
                                            onChange={(e) => setFilters(prev => ({ ...prev, geo: e.target.value }))}
                                        >
                                            <option value="All" className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">All GEOs</option>
                                            {availableGeos.map(geo => (
                                                <option key={geo} value={geo} className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">{geo}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                                    </div>

                                    {/* Granularity Selector */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <CalendarClock size={14} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm"
                                            value={granularity}
                                            onChange={(e) => setGranularity(e.target.value as Granularity)}
                                        >
                                            <option value="Daily">{t.daily}</option>
                                            <option value="Weekly">{t.weekly}</option>
                                            <option value="Monthly">{t.monthly}</option>
                                            <option value="Yearly">{t.yearly}</option>
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Keywords */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <Search size={16} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-10 pr-8 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm"
                                            value={filters.keyword}
                                            onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
                                        >
                                            <option value="All">{t.allKeywords}</option>
                                            {availableKeywords.map(k => (
                                                <option key={k} value={k}>{k}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Date Picker & Reset Wrapper */}
                                    <div className="col-span-2 lg:col-span-1 lg:ml-auto flex items-center gap-2 w-full lg:w-auto">
                                        {/* Date Range Picker */}
                                        <div className="flex-1 lg:w-auto">
                                            <DateRangePicker
                                                startDate={filters.startDate}
                                                endDate={filters.endDate}
                                                onChange={(s, e) => setFilters(prev => ({ ...prev, startDate: s, endDate: e }))}
                                                theme={theme}
                                                t={t}
                                            />
                                        </div>

                                        {/* Reset Filters Button */}
                                        <button
                                            onClick={resetAllFilters}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 bg-white dark:bg-slate-700 shadow-sm shrink-0"
                                            title="Reset Filters"
                                        >
                                            <FilterX size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </header>

                        {/* Dashboard Main Scrollable Area */}
                        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 pb-20">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                            <TrendingUp size={24} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Total Installs</p>
                                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate" title={summary.installs.toLocaleString()}>{summary.installs.toLocaleString()}</h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Ranking Card - Dynamic Styling */}
                                <div className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${summary.rank === 1
                                    ? "bg-gradient-to-br from-slate-900 via-slate-800 to-black border-slate-700 shadow-xl shadow-slate-800/50 text-white" // Black Platinum
                                    : summary.rank > 0 && summary.rank <= 3
                                        ? "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200 shadow-md text-amber-900 dark:from-red-900/40 dark:to-red-800/40 dark:border-red-800 dark:text-red-100"
                                        : summary.rank > 3 && summary.rank <= 10
                                            ? "bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-200 shadow-sm text-emerald-900 dark:from-blue-900/40 dark:to-blue-800/40 dark:border-blue-800 dark:text-blue-100"
                                            : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:shadow-md text-slate-800 dark:text-slate-100"
                                    }`}>
                                    {/* Diagonal Silver Lining for Rank 1 */}
                                    {summary.rank === 1 && (
                                        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent pointer-events-none -translate-x-1/4 skew-x-12" />
                                    )}

                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-4">
                                            {/* Icon Container */}
                                            <div className={`flex items-center justify-center ${summary.rank === 1 ? "" : // Custom container for Rank 1
                                                "p-3 rounded-xl border"
                                                } ${summary.rank > 0 && summary.rank <= 3 && summary.rank !== 1 ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700" :
                                                    summary.rank > 3 && summary.rank <= 10 ? "bg-emerald-100 text-emerald-600 border border-emerald-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700" :
                                                        summary.rank !== 1 ? "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700" : ""
                                                }`}>
                                                {summary.rank === 1 ? (
                                                    <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-600 to-red-700 shadow-[0_0_20px_rgba(234,88,12,0.6)] ring-2 ring-slate-800">
                                                        {/* Center Fire */}
                                                        <Flame size={28} className="text-white fill-white animate-pulse drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                                    </div>
                                                ) :
                                                    summary.rank > 0 && summary.rank <= 3 ? <Trophy size={24} fill="currentColor" className="opacity-90" /> :
                                                        summary.rank > 3 && summary.rank <= 10 ? <Award size={24} /> :
                                                            <Hash size={24} />
                                                }
                                            </div>
                                            <div>
                                                <p className={`text-sm font-medium ${summary.rank === 1 ? "text-slate-400" : "opacity-70"}`}>
                                                    {summary.keywordCount === 1 && summary.geoCount === 1 ? 'Latest Ranking' : 'Avg. Ranking'}
                                                </p>
                                                <h3 className="text-2xl font-bold">
                                                    {summary.rank > 0 ? `#${summary.rank}` : '-'}
                                                </h3>
                                            </div>
                                        </div>

                                        <div className={`text-right pl-4 border-l ${summary.rank === 1 ? 'border-slate-700' :
                                            summary.rank > 0 && summary.rank <= 3 ? 'border-amber-200/50 dark:border-red-700/50' :
                                                summary.rank > 3 && summary.rank <= 10 ? 'border-emerald-200/50 dark:border-blue-700/50' :
                                                    'border-slate-100 dark:border-slate-800'
                                            }`}>
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-xs font-semibold ${summary.rank === 1 ? 'text-slate-400' : 'opacity-60'}`}>
                                                    across {summary.keywordCount} Keywords
                                                </span>
                                                <span className={`text-xs font-semibold ${summary.rank === 1 ? 'text-slate-400' : 'opacity-60'}`}>
                                                    across {summary.geoCount} Geos
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                            <DollarSign size={24} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Total Cost</p>
                                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate" title={`$${summary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>${summary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Charts Section */}
                            <DashboardCharts
                                data={filteredData}
                                granularity={granularity}
                                viewMode={viewMode}
                                theme={theme}
                                translations={t}
                            />

                            {/* Real-Time Standings Section */}
                            {filters.appName && (() => {
                                // Find ALL entries for this app (ignoring filters) to get the truly latest one
                                const allAppEntries = data.filter(d => d.appName === filters.appName);
                                if (allAppEntries.length === 0) return null;

                                // Get the latest entry by date
                                const latestEntry = allAppEntries.reduce((latest, current) => {
                                    return new Date(current.date) > new Date(latest.date) ? current : latest;
                                }, allAppEntries[0]);

                                // Get all unique keyword/geo pairs for this specific app+id combination
                                const itemsForLatestApp = data
                                    .filter(d => d.appName === filters.appName && d.appId === latestEntry.appId)
                                    .map(d => ({ keyword: d.keyword, geo: d.geo }))
                                    .filter((item, index, self) =>
                                        index === self.findIndex(t => t.keyword === item.keyword && t.geo === item.geo)
                                    );

                                return (
                                    <div className="mt-8">
                                        <RealtimeStandings
                                            appId={latestEntry.appId}
                                            appName={filters.appName}
                                            appIcon={appIcons[filters.appName]}
                                            items={itemsForLatestApp}
                                            getCountryFlag={getCountryFlag}
                                            theme={theme}
                                            translations={t}
                                        />
                                    </div>
                                );
                            })()}

                            {/* AI Analysis Section */}
                            {aiAnalysis && (
                                <div className="mt-8 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center gap-3">
                                        <BrainCircuit className="text-white animate-pulse" size={24} />
                                        <h3 className="text-lg font-bold text-white">{t.aiAnalysis}</h3>
                                    </div>
                                    <div className="p-6 prose prose-slate dark:prose-invert max-w-none">
                                        <div dangerouslySetInnerHTML={{
                                            __html: aiAnalysis
                                                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-200 font-bold">$1</strong>')
                                                .replace(/\* (.*?)\n/g, '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300">$1</li>')
                                                .replace(/\n/g, '<br />')
                                        }} />
                                    </div>
                                </div>
                            )}

                            {/* Data Management Section */}
                            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex flex-col gap-6">
                                    {/* Header */}
                                    <div>
                                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.dataManagement}</h4>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t.manageSettings} <span className="font-medium text-slate-800 dark:text-slate-200">{filters.appName || 'current selection'}</span>.</p>
                                    </div>

                                    {/* Controls Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* CPI Management */}
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t.defaultCpi}</label>
                                                {showCpiSuccess && (
                                                    <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold animate-in fade-in">
                                                        <Check size={12} /> {t.update}d!
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full pl-6 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
                                                        value={cpiInput}
                                                        onChange={(e) => setCpiInput(e.target.value)}
                                                        placeholder="0.09"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleRequestCPIUpdate}
                                                    className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                                >
                                                    {t.update}
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">
                                                Updates historical cost data for all entries of this app.
                                            </p>
                                        </div>

                                        {/* Danger Zone */}
                                        <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 flex flex-col justify-center items-start">
                                            <h5 className="text-sm font-bold text-red-800 dark:text-red-400 mb-1">{t.dangerZone}</h5>
                                            <p className="text-xs text-red-600 dark:text-red-300 mb-3">{t.permanentlyRemove}</p>
                                            <div className="flex flex-col gap-2 w-full">
                                                <button
                                                    onClick={requestDeleteApp}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 transition-colors text-sm font-medium shadow-sm w-full"
                                                >
                                                    <Trash2 size={16} />
                                                    {t.deleteApp}
                                                </button>
                                                <button
                                                    onClick={requestDeleteAllApps}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-800 border border-red-800 text-white rounded-lg hover:bg-red-700 hover:border-red-700 transition-colors text-sm font-medium shadow-sm w-full"
                                                >
                                                    <AlertTriangle size={16} />
                                                    Delete All {filters.appName} Data
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Upload Modal */}
            <DataUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onAddData={handleAddData}
                selectedApp={filters.appName}
                activeApps={activeApps}
                existingDataKeys={existingDataKeys}
                theme={theme}
                t={t}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Delete Application?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-200">{deleteConfirmation}</strong>?<br />
                                This action cannot be undone and all associated data will be permanently removed.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setDeleteConfirmation(null)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteApp}
                                    className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-lg shadow-red-500/30 transition-colors"
                                >
                                    Yes, Delete it
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete ALL Confirmation Modal */}
            {deleteAllConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30 animate-pulse">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Delete All {filters.appName} Data?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Are you sure you want to delete <strong className="text-red-600 dark:text-red-400">ALL DATA</strong> for <span className="font-bold">{filters.appName}</span>?<br />
                                <span className="font-bold text-red-600 dark:text-red-400">This will remove all versions and IDs for this app.</span>
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setDeleteAllConfirmation(false)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteAllApps}
                                    className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-lg shadow-red-500/30 transition-colors"
                                >
                                    Yes, Delete All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CPI Confirmation Modal */}
            {cpiConfirmation !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <DollarSign size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Update Cost Per Install?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Update CPI to <strong className="text-slate-900 dark:text-slate-200">${cpiConfirmation.toFixed(2)}</strong> for all records of <strong className="text-slate-900 dark:text-slate-200">{filters.appName}</strong>?<br />
                                This will recalculate historical costs.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setCpiConfirmation(null)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmUpdateCPI}
                                    className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-colors"
                                >
                                    Yes, Update
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Management Modal */}
            {categoryModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-sm shadow-xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                    {categoryModal.mode === 'create' && t.newFolder}
                                    {categoryModal.mode === 'rename' && 'Rename Folder'}
                                    {categoryModal.mode === 'delete' && 'Delete Folder'}
                                </h3>
                                <button
                                    onClick={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {categoryModal.mode === 'delete' ? (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                    Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-200">{categoryModal.targetName}</strong>?
                                    Any apps inside will be moved to "{t.uncategorized}".
                                </p>
                            ) : (
                                <div className="mb-6">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Folder Name</label>
                                    <input
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
                                        value={categoryModal.inputValue}
                                        onChange={(e) => setCategoryModal(prev => ({ ...prev, inputValue: e.target.value }))}
                                        placeholder="My Folder"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCategoryModalSubmit();
                                        }}
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCategoryModalSubmit}
                                    disabled={categoryModal.mode !== 'delete' && !categoryModal.inputValue.trim()}
                                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${categoryModal.mode === 'delete'
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                        }`}
                                >
                                    {categoryModal.mode === 'delete' ? 'Delete' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default App;
