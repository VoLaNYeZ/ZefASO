import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const DEFAULT_CPI = 0.09;
const ALL_TABS_SENTINEL = "__ZEYFASO_ALL_TABS__";

type GoogleSheetsSyncRow = {
  user_id: string;
  web_app_url: string;
  is_sync_enabled: boolean;
  is_server_scheduled?: boolean | null;
  last_synced_at?: string | null;
  selected_tabs?: unknown;
};

type AsoEntryDb = {
  user_id: string;
  date: string; // YYYY-MM-DD
  app_name: string;
  app_group: string;
  app_id: string;
  geo: string;
  keyword: string;
  ranking: number;
  installs: number;
  cpi: number;
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getFirstEnv = (keys: string[]): string => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing env var (any of): ${keys.join(", ")}`);
};

const validateGoogleScriptUrl = (raw: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Google Apps Script URL must be https");
  }

  if (parsed.hostname !== "script.google.com") {
    throw new Error("Invalid Google Apps Script host");
  }

  if (!parsed.pathname.startsWith("/macros/s/")) {
    throw new Error("Invalid Google Apps Script path");
  }

  return parsed;
};

const normalizeStoredTabs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string");
};

const resolveTabsToSync = (
  allTabs: string[],
  storedSelectedTabsRaw: unknown,
): { tabsToSync: string[]; mode: "legacy_selected" | "all_except" } => {
  const storedSelectedTabs = normalizeStoredTabs(storedSelectedTabsRaw);
  const mode = storedSelectedTabs.includes(ALL_TABS_SENTINEL)
    ? "all_except"
    : "legacy_selected";

  if (mode === "all_except") {
    const excludedSet = new Set(
      storedSelectedTabs.filter((t) => t !== ALL_TABS_SENTINEL),
    );
    return { tabsToSync: allTabs.filter((t) => !excludedSet.has(t)), mode };
  }

  const selectedSet = new Set(storedSelectedTabs);
  return { tabsToSync: allTabs.filter((t) => selectedSet.has(t)), mode };
};

const buildActionUrl = (
  base: URL,
  action: "getTabs" | "getData",
  tab?: string,
): string => {
  const url = new URL(base.toString());
  url.searchParams.set("action", action);
  if (action === "getData") {
    url.searchParams.set("tab", tab ?? "");
  }
  return url.toString();
};

const fetchSheetTabs = async (baseUrl: URL): Promise<string[]> => {
  const url = buildActionUrl(baseUrl, "getTabs");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch tabs (${response.status})`);
  const json = await response.json();
  if (!json?.success) throw new Error(json?.error || "Failed to fetch tabs");
  if (!Array.isArray(json.tabs)) return [];
  return json.tabs.filter((t: unknown): t is string => typeof t === "string");
};

const fetchSheetData = async (baseUrl: URL, tab: string): Promise<any[][]> => {
  const url = buildActionUrl(baseUrl, "getData", tab);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tab "${tab}" (${response.status})`);
  }
  const json = await response.json();
  if (!json?.success) throw new Error(json?.error || `Failed to fetch "${tab}"`);
  return Array.isArray(json.data) ? json.data : [];
};

const parseDate = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
    const [day, month, year] = cleanStr.split("/");
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const d = new Date(isoDate);
    if (!isNaN(d.getTime())) return isoDate;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanStr)) {
    const [year, month, day] = cleanStr.split("/");
    const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const d = new Date(isoDate);
    if (!isNaN(d.getTime())) return isoDate;
  }

  // YYYY-MM-DD (or ISO-ish)
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime()) && cleanStr.includes("-")) {
    return cleanStr.slice(0, 10);
  }

  return null;
};

const normalizeGeoCode = (geo: string): string => {
  const trimmed = (geo ?? "").trim();
  const upper = trimmed.toUpperCase();

  const countryMap: Record<string, string> = {
    "UNITED STATES": "US",
    "USA": "US",
    "UNITED KINGDOM": "GB",
    "UK": "GB",
    "GERMANY": "DE",
    "FRANCE": "FR",
    "ITALY": "IT",
    "SPAIN": "ES",
    "CANADA": "CA",
    "AUSTRALIA": "AU",
    "AUSTRIA": "AT",
    "JAPAN": "JP",
    "CHINA": "CN",
    "BRAZIL": "BR",
    "INDIA": "IN",
    "RUSSIA": "RU",
    "SOUTH KOREA": "KR",
    "POLAND": "PL",
    "PO": "PL",
    "AUS": "AU",
    "AUT": "AT",
    "POL": "PL",
  };

  if (countryMap[upper]) return countryMap[upper];
  if (upper.length === 2) return upper;
  return upper.substring(0, 2);
};

const parseNumeric = (raw: string): number | null => {
  const cleaned = (raw ?? "").replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? null : parsed;
};

const processSheetDataToDb = (
  userId: string,
  rows: any[][],
  tabName: string,
): AsoEntryDb[] => {
  const out: AsoEntryDb[] = [];

  let startIndex = 0;
  if (rows.length > 0) {
    const firstRow = rows[0].map((c) => String(c).toLowerCase());
    if (firstRow.some((c) => c.includes("date") || c.includes("app"))) {
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 8) continue;

    // Expected format: Date | App Name | GEO | ID | Keyword | Last Plan | Ranking | Installs | [CPI]
    const dateRaw = String(row[0] ?? "");
    const appGroup = tabName;
    const appName = String(row[1] ?? tabName).trim();
    const geo = normalizeGeoCode(String(row[2] ?? ""));
    const appIdRaw = String(row[3] ?? "").trim();
    const keyword = String(row[4] ?? "").trim();
    const rankingRaw = String(row[6] ?? "").trim();
    const installsRaw = String(row[7] ?? "").trim();
    const cpiRaw = row[8] != null ? String(row[8]).trim() : "";

    const date = parseDate(dateRaw);
    const installsParsed = parseNumeric(installsRaw);
    if (!date || installsParsed === null) continue;

    let ranking = 0;
    if (!rankingRaw.toLowerCase().includes("no") && rankingRaw !== "") {
      const parsed = parseNumeric(rankingRaw);
      if (parsed !== null) ranking = parsed;
    }

    const normalizedAppId = (() => {
      if (/^\d+$/.test(appIdRaw)) return appIdRaw;
      const cleaned = appIdRaw.replace(/[^\dA-Za-z_-]/g, "");
      return cleaned || appName;
    })();

    const cpi = (() => {
      if (!cpiRaw) return DEFAULT_CPI;
      const parsed = parseFloat(cpiRaw);
      return Number.isFinite(parsed) ? parsed : DEFAULT_CPI;
    })();

    out.push({
      user_id: userId,
      date,
      app_name: appName,
      app_group: appGroup,
      app_id: normalizedAppId,
      geo,
      keyword,
      ranking,
      installs: installsParsed,
      cpi,
    });
  }

  return out;
};

serve(async (req) => {
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const provided = req.headers.get("x-cron-secret") ??
        new URL(req.url).searchParams.get("cron_secret");
      if (!provided || provided !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Note: Supabase injects SUPABASE_URL automatically for Edge Functions.
    // Supabase CLI disallows setting secrets that start with SUPABASE_.
    const supabaseUrl = getFirstEnv(["SUPABASE_URL", "PROJECT_URL"]);
    const serviceRoleKey = getFirstEnv(["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const startedAt = Date.now();
    const nowIso = new Date().toISOString();

    const { data: configs, error } = await supabase
      .from("google_sheets_sync")
      .select("*")
      .eq("is_sync_enabled", true)
      .eq("is_server_scheduled", true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = (configs ?? []) as GoogleSheetsSyncRow[];

    let usersProcessed = 0;
    let tabsProcessed = 0;
    let entriesUpserted = 0;
    const userErrors: { user_id: string; error: string }[] = [];

    for (const cfg of rows) {
      const userId = cfg.user_id;
      usersProcessed++;

      try {
        const baseUrl = validateGoogleScriptUrl(cfg.web_app_url);

        let allTabs: string[] = [];
        try {
          allTabs = await fetchSheetTabs(baseUrl);
        } catch (e) {
          // Fall back to stored selection if tab listing is unavailable.
          const stored = normalizeStoredTabs(cfg.selected_tabs);
          if (stored.length === 0 || stored.includes(ALL_TABS_SENTINEL)) {
            throw e;
          }
          allTabs = stored;
        }

        const { tabsToSync } = resolveTabsToSync(allTabs, cfg.selected_tabs);
        const tabs = tabsToSync.length > 0 ? tabsToSync : allTabs;
        tabsProcessed += tabs.length;

        let payload: AsoEntryDb[] = [];
        for (const tab of tabs) {
          try {
            const sheetData = await fetchSheetData(baseUrl, tab);
            payload = payload.concat(processSheetDataToDb(userId, sheetData, tab));
          } catch (e) {
            console.error(`[google-sheets-sync-cron] user=${userId} tab=${tab} error`, e);
          }
        }

        if (payload.length > 0) {
          const batchSize = 500;
          for (let i = 0; i < payload.length; i += batchSize) {
            const batch = payload.slice(i, i + batchSize);
            const { error: upsertError } = await supabase
              .from("aso_entries")
              .upsert(batch, {
                onConflict: "user_id,date,app_id,geo,keyword",
                ignoreDuplicates: false,
              });
            if (upsertError) throw upsertError;
          }

          entriesUpserted += payload.length;
        }

        await supabase
          .from("google_sheets_sync")
          .update({ last_synced_at: nowIso })
          .eq("user_id", userId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        userErrors.push({ user_id: userId, error: message });
        console.error(`[google-sheets-sync-cron] user=${userId} error`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        usersProcessed,
        tabsProcessed,
        entriesUpserted,
        userErrors,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
