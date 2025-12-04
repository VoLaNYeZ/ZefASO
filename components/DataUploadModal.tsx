import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Plus, FileText, CheckCircle, Smartphone, FolderPlus, Layers, Table, RefreshCw } from 'lucide-react';
import { fetchSheetTabs, fetchSheetData, processSheetData } from '../services/googleSheets';
import { supabase } from '../lib/supabase';
import { AsoEntry } from '../types';
import { DEFAULT_CPI } from '../constants';

interface DataUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddData: (newEntries: AsoEntry[]) => void;
    selectedApp: string | null;
    activeApps: string[];
    existingDataKeys: Set<string>;
    theme: 'light' | 'dark';
    t: any;
}

type ImportStrategy = 'existing' | 'new' | 'bulk' | 'sheets';
type InputMethod = 'paste' | 'file' | 'manual';

export const DataUploadModal: React.FC<DataUploadModalProps> = ({ isOpen, onClose, onAddData, selectedApp, activeApps, existingDataKeys, theme, t }) => {
    // Strategy State
    const [strategy, setStrategy] = useState<ImportStrategy>('existing');

    // Input State
    const [inputMethod, setInputMethod] = useState<InputMethod>('paste');
    const [bulkText, setBulkText] = useState('');
    const [targetExistingApp, setTargetExistingApp] = useState(selectedApp || '');
    const [targetNewApp, setTargetNewApp] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importStatus, setImportStatus] = useState<{ added: number, updated: number, skipped: number, dates: string[] } | null>(null);

    // Google Sheets State
    const [webAppUrl, setWebAppUrl] = useState('');
    const [sheetTabs, setSheetTabs] = useState<string[]>([]);
    const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set());
    const [isSyncEnabled, setIsSyncEnabled] = useState(false);
    const [isFetchingTabs, setIsFetchingTabs] = useState(false);
    const [isImportingSheet, setIsImportingSheet] = useState(false);
    const [hasSavedSync, setHasSavedSync] = useState(false);

    // Manual Form State
    const [manualFormData, setManualFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        geo: 'US',
        appId: '',
        keyword: '',
        ranking: '',
        installs: '',
        cpi: DEFAULT_CPI.toString(),
    });

    // Effect to update default selection when prop changes
    useEffect(() => {
        if (isOpen && selectedApp) {
            setTargetExistingApp(selectedApp);
        }
    }, [isOpen, selectedApp]);

    useEffect(() => {
        if (isOpen && strategy === 'sheets') {
            checkSyncStatus();
        }
    }, [isOpen, strategy]);

    const checkSyncStatus = async () => {
        console.log("Checking sync status...");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('google_sheets_sync')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        console.log("Sync status result:", data, error);

        if (data) {
            setWebAppUrl(data.web_app_url);
            // We don't have all tabs stored, only selected ones. 
            // To allow editing, we might need to fetch all tabs again if the user wants to change them.
            // For now, let's just show the selected ones and allow disconnect.
            setSheetTabs(data.selected_tabs || []);
            setSelectedTabs(new Set(data.selected_tabs || []));
            setIsSyncEnabled(data.is_sync_enabled);
            setHasSavedSync(true);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Are you sure you want to disconnect the Google Sheet sync?")) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('google_sheets_sync')
            .delete()
            .eq('user_id', user.id);

        if (!error) {
            setHasSavedSync(false);
            setWebAppUrl('');
            setSheetTabs([]);
            setSelectedTabs(new Set());
            setIsSyncEnabled(false);
        } else {
            alert("Failed to disconnect.");
        }
    };

    if (!isOpen) return null;

    const resetForm = () => {
        setImportStatus(null);
        setBulkText('');
        setTargetNewApp('');
        setTargetExistingApp(selectedApp || (activeApps.length > 0 ? activeApps[0] : ''));
        setManualFormData({
            date: new Date().toISOString().split('T')[0],
            geo: 'US',
            appId: '',
            keyword: '',
            ranking: '',
            installs: '',
            cpi: DEFAULT_CPI.toString(),
        });
        // Default back to reasonable defaults
        setStrategy('existing');
        setInputMethod('paste');
        setWebAppUrl('');
        setSheetTabs([]);
        setSelectedTabs(new Set());
        setIsSyncEnabled(false);
    };

    const parseDate = (dateStr: string): string | null => {
        if (!dateStr) return null;
        const cleanStr = dateStr.trim();

        // Handle DD/MM/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
            const [day, month, year] = cleanStr.split('/');
            const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const d = new Date(isoDate);
            if (!isNaN(d.getTime())) return isoDate;
        }

        // Handle YYYY/MM/DD
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanStr)) {
            const [year, month, day] = cleanStr.split('/');
            const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const d = new Date(isoDate);
            if (!isNaN(d.getTime())) return isoDate;
        }

        // Handle YYYY-MM-DD
        const d = new Date(cleanStr);
        if (!isNaN(d.getTime()) && cleanStr.includes('-')) {
            return cleanStr;
        }

        return null;
    };

    // Normalize country names to ISO codes
    const normalizeGeoCode = (geo: string): string => {
        const trimmed = geo.trim();

        // Common country name mappings
        const countryMap: Record<string, string> = {
            // Full names to codes
            'Australia': 'AU', 'australia': 'AU',
            'Finland': 'FI', 'finland': 'FI',
            'Austria': 'AT', 'austria': 'AT',
            'Netherlands': 'NL', 'netherlands': 'NL',
            'Portugal': 'PT', 'portugal': 'PT',
            'Sweden': 'SE', 'sweden': 'SE',
            'United States': 'US', 'united states': 'US',
            'United Kingdom': 'GB', 'united kingdom': 'GB', 'UK': 'GB', 'uk': 'GB',
            'Germany': 'DE', 'germany': 'DE',
            'France': 'FR', 'france': 'FR',
            'Spain': 'ES', 'spain': 'ES',
            'Italy': 'IT', 'italy': 'IT',
            'Canada': 'CA', 'canada': 'CA',
            'Japan': 'JP', 'japan': 'JP',
            'China': 'CN', 'china': 'CN',
            'Brazil': 'BR', 'brazil': 'BR',
            'India': 'IN', 'india': 'IN',
            'Mexico': 'MX', 'mexico': 'MX',
            'South Korea': 'KR', 'south korea': 'KR',
            'Russia': 'RU', 'russia': 'RU',
            'Turkey': 'TR', 'turkey': 'TR',
            'Poland': 'PL', 'poland': 'PL',
            'Belgium': 'BE', 'belgium': 'BE',
            'Denmark': 'DK', 'denmark': 'DK',
            'Norway': 'NO', 'norway': 'NO',
            'Switzerland': 'CH', 'switzerland': 'CH',
            'Ireland': 'IE', 'ireland': 'IE',
            'New Zealand': 'NZ', 'new zealand': 'NZ',
            'Singapore': 'SG', 'singapore': 'SG',
            'Hong Kong': 'HK', 'hong kong': 'HK',
            'South Africa': 'ZA', 'south africa': 'ZA',
            'Argentina': 'AR', 'argentina': 'AR',
            'Chile': 'CL', 'chile': 'CL',
            'Colombia': 'CO', 'colombia': 'CO',
            'Peru': 'PE', 'peru': 'PE',
            'Thailand': 'TH', 'thailand': 'TH',
            'Vietnam': 'VN', 'vietnam': 'VN',
            'Philippines': 'PH', 'philippines': 'PH',
            'Indonesia': 'ID', 'indonesia': 'ID',
            'Malaysia': 'MY', 'malaysia': 'MY',
            'Taiwan': 'TW', 'taiwan': 'TW',
            'Greece': 'GR', 'greece': 'GR',
            'Czech Republic': 'CZ', 'czech republic': 'CZ',
            'Romania': 'RO', 'romania': 'RO',
            'Hungary': 'HU', 'hungary': 'HU',
            'Slovakia': 'SK', 'slovakia': 'SK',
            'Croatia': 'HR', 'croatia': 'HR',
            'Israel': 'IL', 'israel': 'IL',
            'UAE': 'AE', 'uae': 'AE', 'United Arab Emirates': 'AE',
            'Saudi Arabia': 'SA', 'saudi arabia': 'SA',
            'Egypt': 'EG', 'egypt': 'EG',
            'Ukraine': 'UA', 'ukraine': 'UA',
        };

        // Check if it's a full name that needs conversion
        if (countryMap[trimmed]) {
            return countryMap[trimmed];
        }

        // If it's already a code (2-3 letters), return uppercase
        if (trimmed.length <= 3) {
            return trimmed.toUpperCase();
        }

        // If no mapping found, return as-is but log it
        console.warn(`Unknown country name: "${trimmed}" - using as-is`);
        return trimmed;
    };
    const parseLine = (line: string): string[] => {
        const hasTab = line.includes('\t');
        const hasComma = line.includes(',');

        const splitWithSeparator = (separator: string): string[] => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if (char === '"') {
                    // Toggle quotes unless it's an escaped quote
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++; // Skip the escaped quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === separator && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }

            result.push(current.trim());
            return result;
        };

        if (hasTab || hasComma) {
            // Prefer tabs if present, otherwise fallback to comma-separated parsing
            return splitWithSeparator(hasTab ? '\t' : ',');
        }

        // Fallback: split by whitespace but keep quoted sections intact
        const tokens: string[] = [];
        const regex = /"([^"]*)"|(\S+)/g;
        let match;

        while ((match = regex.exec(line)) !== null) {
            tokens.push((match[1] || match[2]).trim());
        }

        return tokens;
    };

    const parseAndSubmit = (text: string, forcedAppName?: string) => {
        const lines = text.trim().split('\n');
        const newEntries: AsoEntry[] = [];
        let skippedCount = 0;
        let addedCount = 0;
        let updatedCount = 0;
        const foundDates = new Set<string>();

        lines.forEach((line, index) => {
            // Determine separator: usually tab from Sheets/Excel, or comma from CSV
            const cols = parseLine(line).map(c => c.replace(/^"|"$/g, ''));

            // Skip empty lines or lines with just separators
            if (!line.trim() || cols.every(c => !c)) {
                return;
            }

            // Expected: Date | App Name | GEO | ID | Keyword | Last Plan | Ranking | Installs | [CPI]

            // Check if it's a header row
            if (index === 0 && (cols[0].toLowerCase().includes('date') || cols[1].toLowerCase().includes('app'))) {
                return;
            }

            if (cols.length >= 8) {
                const dateRaw = cols[0];
                const csvAppName = cols[1].trim();
                const csvId = cols[3].trim();

                // App Name Logic (Sidebar Group): 
                // Use forced name if provided (Existing/New modes), else use CSV name (Bulk mode)
                const sidebarAppName = forcedAppName ? forcedAppName.trim() : csvAppName;

                // ID Logic (Filter Display & Internal ID): 
                // Always use the original CSV App Name + CSV ID. 
                // This ensures that even if grouped under a generic sidebar name, 
                // the filter shows the specific app source.
                const compositeId = `${csvAppName} ${csvId}`;

                // Parse ranking
                let ranking = 0;
                const rawRank = cols[6].toLowerCase().trim();
                // Check for "no data", "no date", "nan", or empty string
                if (!rawRank.includes('no data') && !rawRank.includes('no date') && rawRank !== 'nan' && rawRank !== '') {
                    const parsed = parseInt(cols[6]);
                    if (!isNaN(parsed)) ranking = parsed;
                }

                const installs = parseInt(cols[7]);
                const date = parseDate(dateRaw);

                // Basic sanity check
                if (date && sidebarAppName && !isNaN(installs)) {
                    foundDates.add(date);
                    const entry: AsoEntry = {
                        id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        date: date,
                        appName: sidebarAppName,
                        geo: normalizeGeoCode(cols[2]) || 'Unknown',
                        appId: compositeId,
                        keyword: cols[4].trim() || 'None',
                        ranking: ranking, // 0 means unranked/no data
                        installs: installs,
                        cpi: cols[8] ? parseFloat(cols[8]) : DEFAULT_CPI
                    };

                    // Check if this key exists
                    const key = `${entry.date}-${entry.appId}-${entry.geo}-${entry.keyword}`;
                    if (existingDataKeys.has(key)) {
                        updatedCount++;
                    } else {
                        addedCount++;
                    }

                    newEntries.push(entry);
                } else {
                    console.warn('Skipping invalid row:', line);
                    skippedCount++;
                }
            } else {
                if (line.trim().length > 0) skippedCount++;
            }
        });

        if (newEntries.length > 0) {
            onAddData(newEntries);
            setImportStatus({
                added: addedCount,
                updated: updatedCount,
                skipped: skippedCount,
                dates: Array.from(foundDates).sort()
            });
        } else {
            alert("Could not parse valid data. Please ensure the format matches: Date | App Name | GEO | ID | Keyword | Last Plan | Ranking | Installs");
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        let appName = '';
        if (strategy === 'existing') appName = targetExistingApp;
        else if (strategy === 'new') appName = targetNewApp;

        if (!appName) {
            alert("Please select or enter an App Name");
            return;
        }

        const appNameTrimmed = appName.trim();
        const newEntry: AsoEntry = {
            id: `${appNameTrimmed}-${manualFormData.geo}-${Date.now()}`,
            date: manualFormData.date,
            appName: appNameTrimmed,
            geo: manualFormData.geo.trim(),
            appId: `${appNameTrimmed} ${manualFormData.appId}`,
            keyword: manualFormData.keyword.trim(),
            ranking: parseInt(manualFormData.ranking) || 0,
            installs: parseInt(manualFormData.installs) || 0,
            cpi: parseFloat(manualFormData.cpi),
        };

        onAddData([newEntry]);
        onClose();
        resetForm();
    };

    const handleSubmit = () => {
        if (inputMethod === 'manual') {
            // Handled by form submit
            return;
        }

        let targetName: string | undefined = undefined;
        if (strategy === 'existing') {
            if (!targetExistingApp) {
                alert("Please select an existing app.");
                return;
            }
            targetName = targetExistingApp;
        } else if (strategy === 'new') {
            if (!targetNewApp.trim()) {
                alert("Please enter a name for the new app.");
                return;
            }
            targetName = targetNewApp;
        }
        // if strategy is 'bulk', targetName remains undefined, causing parser to use CSV columns

        parseAndSubmit(bulkText, targetName);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) {
                let targetName: string | undefined = undefined;
                if (strategy === 'existing') targetName = targetExistingApp;
                if (strategy === 'new') targetName = targetNewApp;

                parseAndSubmit(text, targetName);
            }
        };
        reader.readAsText(file);
    };

    const handleFetchTabs = async () => {
        if (!webAppUrl) {
            alert("Please enter the Web App URL");
            return;
        }
        setIsFetchingTabs(true);
        try {
            const tabs = await fetchSheetTabs(webAppUrl);
            setSheetTabs(tabs);
            setSelectedTabs(new Set(tabs)); // Select all by default
        } catch (error: any) {
            alert(`Failed to fetch tabs: ${error.message}`);
        } finally {
            setIsFetchingTabs(false);
        }
    };

    const handleSheetImport = async () => {
        if (selectedTabs.size === 0) {
            alert("Please select at least one tab to import");
            return;
        }
        setIsImportingSheet(true);
        try {
            let allEntries: AsoEntry[] = [];
            let addedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            const foundDates = new Set<string>();

            for (const tab of selectedTabs) {
                const data = await fetchSheetData(webAppUrl, tab);
                const entries = processSheetData(data, tab);

                entries.forEach(entry => {
                    const key = `${entry.date}-${entry.appId}-${entry.geo}-${entry.keyword}`;
                    if (existingDataKeys.has(key)) {
                        updatedCount++;
                    } else {
                        addedCount++;
                    }
                    foundDates.add(entry.date);
                });

                allEntries = [...allEntries, ...entries];
            }

            if (allEntries.length > 0) {
                onAddData(allEntries);
                setImportStatus({
                    added: addedCount,
                    updated: updatedCount,
                    skipped: skippedCount, // Note: processSheetData doesn't count skips explicitly, but we could improve this
                    dates: Array.from(foundDates).sort()
                });

                // Save Sync Settings
                if (isSyncEnabled) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { error } = await supabase
                            .from('google_sheets_sync')
                            .upsert({
                                user_id: user.id,
                                web_app_url: webAppUrl,
                                is_sync_enabled: true,
                                selected_tabs: Array.from(selectedTabs),
                                last_synced_at: new Date().toISOString()
                            });
                        if (error) {
                            console.error("Failed to save sync settings:", error);
                            alert("Data imported, but failed to save sync settings: " + error.message);
                        } else {
                            console.log("Sync settings saved successfully.");
                        }
                    }
                }
            } else {
                alert("No valid data found in selected tabs.");
            }

        } catch (error: any) {
            alert(`Import failed: ${error.message}`);
        } finally {
            setIsImportingSheet(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t.addAsoData}</h2>
                    <button onClick={() => { onClose(); resetForm(); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X size={20} className="text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {importStatus ? (
                        <div className="flex flex-col items-center justify-center py-4 space-y-6">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                <CheckCircle size={32} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t.importSuccessful}</h3>
                                <div className="flex gap-4 justify-center mt-3 text-sm">
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importStatus.added}</span>
                                        <span className="text-slate-500 dark:text-slate-400 font-medium">{t.added}</span>
                                    </div>
                                    {importStatus.updated > 0 && (
                                        <div className="flex flex-col items-center">
                                            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{importStatus.updated}</span>
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">{t.updated}</span>
                                        </div>
                                    )}
                                    {importStatus.skipped > 0 && (
                                        <div className="flex flex-col items-center">
                                            <span className="text-2xl font-bold text-slate-400 dark:text-slate-500">{importStatus.skipped}</span>
                                            <span className="text-slate-500 dark:text-slate-400 font-medium">{t.skipped}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 w-full border border-slate-100 dark:border-slate-800">
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">{t.datesProcessed}:</p>
                                <div className="flex flex-wrap gap-2">
                                    {importStatus.dates.map(d => (
                                        <span key={d} className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-300 font-mono">
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => { onClose(); resetForm(); }}
                                className="bg-slate-900 dark:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                            >
                                {t.done}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 1. Choose Target Strategy */}
                            <div className="mb-6">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase block mb-3">1. {t.whereDataGo}</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <button
                                        onClick={() => { setStrategy('existing'); setInputMethod('paste'); }}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${strategy === 'existing'
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                                            }`}
                                    >
                                        <Smartphone className="mb-2" size={24} />
                                        <span className="text-sm font-semibold">{t.existingApp}</span>
                                    </button>

                                    <button
                                        onClick={() => { setStrategy('new'); setInputMethod('paste'); }}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${strategy === 'new'
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                                            }`}
                                    >
                                        <FolderPlus className="mb-2" size={24} />
                                        <span className="text-sm font-semibold">{t.createNewApp}</span>
                                    </button>

                                    <button
                                        onClick={() => { setStrategy('bulk'); setInputMethod('paste'); }}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${strategy === 'bulk'
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                                            }`}
                                    >
                                        <Layers className="mb-2" size={24} />
                                        <span className="text-sm font-semibold">{t.smartBulk}</span>
                                    </button>

                                    <button
                                        onClick={() => { setStrategy('sheets'); setInputMethod('manual'); }}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${strategy === 'sheets'
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                                            }`}
                                    >
                                        <Table className="mb-2" size={24} />
                                        <span className="text-sm font-semibold">Google Sheets</span>
                                    </button>
                                </div>
                            </div>

                            {/* Strategy Specific Inputs */}
                            {strategy === 'existing' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">{t.selectApplication}</label>
                                    <select
                                        value={targetExistingApp}
                                        onChange={(e) => setTargetExistingApp(e.target.value)}
                                        className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                                    >
                                        <option value="" disabled>{t.selectAppPlaceholder}</option>
                                        {activeApps.map(app => (
                                            <option key={app} value={app}>{app}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                                        {t.existingAppDesc} <strong>{targetExistingApp || '...'}</strong>.
                                    </p>
                                </div>
                            )}

                            {strategy === 'new' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">{t.newAppName}</label>
                                    <input
                                        value={targetNewApp}
                                        onChange={(e) => setTargetNewApp(e.target.value)}
                                        placeholder="e.g. My Awesome App"
                                        className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                                        autoFocus
                                    />
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                                        {t.newAppDesc} "<strong>{targetNewApp || '...'}</strong>".
                                    </p>
                                </div>
                            )}

                            {strategy === 'bulk' && (
                                <div className="mb-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 animate-in fade-in slide-in-from-top-2">
                                    <p><strong>{t.smartBulkMode}:</strong> {t.smartBulkDesc}</p>
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                                        <li>One app per file line: App Name, Date, Geo, Keyword, Rank, Installs, CPI</li>
                                        <li>Multi-app imports: Each row → correct app (by name)</li>
                                    </ul>
                                </div>
                            )}

                            {strategy === 'sheets' && (
                                <div className="mb-6 animate-in fade-in slide-in-from-top-2 space-y-4">
                                    {hasSavedSync ? (
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                                            <div className="flex items-center space-x-2 mb-3">
                                                <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={20} />
                                                <h3 className="font-bold text-emerald-800 dark:text-emerald-300">Sync Active</h3>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">Connected Web App URL</label>
                                                    <div className="text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 truncate text-slate-700 dark:text-slate-300">
                                                        {webAppUrl}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex justify-between items-end mb-1">
                                                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Synced Tabs</label>
                                                        <button
                                                            onClick={async () => {
                                                                setIsFetchingTabs(true);
                                                                try {
                                                                    const tabs = await fetchSheetTabs(webAppUrl);
                                                                    setSheetTabs(tabs);
                                                                    // Keep existing selection, but filter out tabs that no longer exist
                                                                    const newSet = new Set<string>();
                                                                    selectedTabs.forEach(t => {
                                                                        if (tabs.includes(t)) newSet.add(t);
                                                                    });
                                                                    setSelectedTabs(newSet);
                                                                    alert(`Tabs refreshed! Found ${tabs.length} tabs.`);
                                                                } catch (error: any) {
                                                                    alert(`Failed to refresh tabs: ${error.message}`);
                                                                } finally {
                                                                    setIsFetchingTabs(false);
                                                                }
                                                            }}
                                                            disabled={isFetchingTabs}
                                                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1"
                                                        >
                                                            <RefreshCw size={12} className={isFetchingTabs ? "animate-spin" : ""} />
                                                            {isFetchingTabs ? "Refreshing..." : "Refresh Tabs"}
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Array.from(selectedTabs).map(tab => (
                                                            <span key={tab} className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-300">
                                                                {tab}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="pt-3 flex gap-3">
                                                    <button
                                                        onClick={() => setHasSavedSync(false)}
                                                        disabled={isImportingSheet}
                                                        className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm disabled:opacity-50"
                                                    >
                                                        Edit Settings
                                                    </button>
                                                    <button
                                                        onClick={handleSheetImport}
                                                        disabled={isImportingSheet}
                                                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {isImportingSheet && <RefreshCw size={14} className="animate-spin" />}
                                                        {isImportingSheet ? 'Syncing...' : 'Run Sync'}
                                                    </button>
                                                    <button
                                                        onClick={handleDisconnect}
                                                        disabled={isImportingSheet}
                                                        className="px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm disabled:opacity-50"
                                                    >
                                                        Disconnect
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">Google Apps Script Web App URL</label>
                                                <input
                                                    value={webAppUrl}
                                                    onChange={(e) => setWebAppUrl(e.target.value)}
                                                    placeholder="https://script.google.com/macros/s/.../exec"
                                                    className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                                                />
                                                <p className="text-xs text-slate-400 mt-1">Get this by deploying the Apps Script in your Google Sheet.</p>
                                            </div>

                                            {!sheetTabs.length ? (
                                                <button
                                                    onClick={handleFetchTabs}
                                                    disabled={isFetchingTabs || !webAppUrl}
                                                    className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                                >
                                                    {isFetchingTabs ? 'Fetching Tabs...' : 'Fetch Tabs'}
                                                </button>
                                            ) : (
                                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase block mb-2">Select Tabs (Apps)</label>
                                                    <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
                                                        {sheetTabs.map(tab => (
                                                            <label key={tab} className="flex items-center space-x-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTabs.has(tab)}
                                                                    onChange={(e) => {
                                                                        const newSet = new Set(selectedTabs);
                                                                        if (e.target.checked) newSet.add(tab);
                                                                        else newSet.delete(tab);
                                                                        setSelectedTabs(newSet);
                                                                    }}
                                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                />
                                                                <span className="text-sm text-slate-700 dark:text-slate-300">{tab}</span>
                                                            </label>
                                                        ))}
                                                    </div>

                                                    <div className="flex items-center space-x-2 mb-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            id="autoSync"
                                                            checked={isSyncEnabled}
                                                            onChange={(e) => setIsSyncEnabled(e.target.checked)}
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <label htmlFor="autoSync" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                                            Automatic daily sync (on session start)
                                                        </label>
                                                    </div>

                                                    <button
                                                        onClick={handleSheetImport}
                                                        disabled={isImportingSheet || selectedTabs.size === 0}
                                                        className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                                    >
                                                        {isImportingSheet ? 'Importing...' : 'Import Selected Tabs'}
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* 2. Choose Input Method (Hidden for Sheets) */}
                            {strategy !== 'sheets' && (
                                <div className="mb-4">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase block mb-3">2. {t.dataSource}</label>
                                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                        <button
                                            onClick={() => setInputMethod('paste')}
                                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${inputMethod === 'paste' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                                        >
                                            {t.pasteText}
                                        </button>
                                        <button
                                            onClick={() => setInputMethod('file')}
                                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${inputMethod === 'file' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                                        >
                                            {t.csvFile}
                                        </button>
                                        {strategy !== 'bulk' && (
                                            <button
                                                onClick={() => setInputMethod('manual')}
                                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${inputMethod === 'manual' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                                            >
                                                {t.manualEntry}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Input Area */}
                            <div className="animate-in fade-in">
                                {inputMethod === 'paste' && (
                                    <div>
                                        <textarea
                                            className="w-full h-40 p-3 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                                            placeholder={`23/11/2025\tApp Name\tUS\t174959\tKeyword\t98\t2\t99`}
                                            value={bulkText}
                                            onChange={e => setBulkText(e.target.value)}
                                        />
                                        <div className="mt-2 text-xs text-slate-400">
                                            {t.formatHint}
                                        </div>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={!bulkText}
                                            className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t.parseUpload}
                                        </button>
                                    </div>
                                )}

                                {inputMethod === 'file' && (
                                    <div className="text-center py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            accept=".csv,.tsv,.txt"
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex flex-col items-center mx-auto text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                        >
                                            <Upload size={32} className="mb-2" />
                                            <span className="font-semibold">{t.clickToUpload}</span>
                                        </button>
                                    </div>
                                )}

                                {inputMethod === 'manual' && strategy !== 'bulk' && strategy !== 'sheets' && (
                                    <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Date</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500"
                                                value={manualFormData.date}
                                                onChange={e => setManualFormData({ ...manualFormData, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">GEO</label>
                                            <input
                                                required
                                                onChange={e => setManualFormData({ ...manualFormData, geo: e.target.value })}
                                                placeholder="US"
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">App ID</label>
                                            <input
                                                required
                                                onChange={e => setManualFormData({ ...manualFormData, appId: e.target.value })}
                                                placeholder="123456"
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Keyword</label>
                                            <input
                                                required
                                                onChange={e => setManualFormData({ ...manualFormData, keyword: e.target.value })}
                                                placeholder="Keyword..."
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500 placeholder:font-['cursive']"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Ranking</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500"
                                                value={manualFormData.ranking}
                                                onChange={e => setManualFormData({ ...manualFormData, ranking: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 uppercase">Installs</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 dark:placeholder-slate-500"
                                                value={manualFormData.installs}
                                                onChange={e => setManualFormData({ ...manualFormData, installs: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1 md:col-span-2">
                                            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 mt-2">
                                                {t.addSingleEntry}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
};