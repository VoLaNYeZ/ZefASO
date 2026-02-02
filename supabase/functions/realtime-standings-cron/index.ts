import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { toIsoCountryCode } from "../_shared/geo.ts";

const ALLOWED_ORIGINS = [
  "https://zefaso.tech",
  "https://www.zefaso.tech",
  "http://localhost:3000",
  "http://localhost:5173",
];

const ITUNES_RATE_LIMIT_MS = 3200;
const ITUNES_RETRY_LIMIT = 3;
const OK_TTL_MS = 1000 * 60 * 60 * 6;
const TRAFFIC_REQUEST_LIMIT = 550;
const ASO_POLL_INTERVAL_MS = 2000;
const ASO_MAX_POLLS = 10;

let rateLimitChain = Promise.resolve();
let nextRateAllowedAt = 0;

const scheduleRateLimit = async () => {
  rateLimitChain = rateLimitChain.then(async () => {
    const waitMs = Math.max(0, nextRateAllowedAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextRateAllowedAt = Date.now() + ITUNES_RATE_LIMIT_MS;
  });
  await rateLimitChain;
};

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin || "")
    ? origin!
    : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

type CronInput = {
  mode?: "scheduled";
  userId?: string;
  appGroup?: string;
  dryRun?: boolean;
  maxApps?: number;
  maxKeywordGeos?: number;
};

type LatestAppRow = {
  user_id: string;
  app_group: string;
  app_id: string;
  date?: string | null;
  geo?: string | null;
};

type StatusRow = {
  app_id: string;
  status: "banned" | "ok";
  checked_at?: string | null;
  updated_at?: string | null;
};

type KeywordGeo = { keyword: string; geo: string };

const getFirstEnv = (keys: string[]): string => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing env var (any of): ${keys.join(", ")}`);
};

const buildSupabaseClient = () => {
  const supabaseUrl = getFirstEnv(["SUPABASE_URL", "PROJECT_URL"]);
  const serviceRoleKey = getFirstEnv(["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const extractNumericId = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const matches = String(raw).match(/(\d+)/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
};

const normalizeTargetId = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
};

const parseTimestampMs = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isOkFresh = (row?: StatusRow | null): boolean => {
  if (!row || row.status !== "ok") return false;
  const ts = parseTimestampMs(row.checked_at ?? row.updated_at);
  if (!ts) return false;
  return Date.now() - ts < OK_TTL_MS;
};

const normalizeCountry = (geo: string | null | undefined): string => {
  const code = toIsoCountryCode((geo || "").trim());
  if (!code || code === "ALL") return "US";
  return code;
};

const fetchItunesJson = async (url: string): Promise<any> => {
  let attempt = 0;
  while (true) {
    attempt += 1;
    await scheduleRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZeyfASO/1.0)" },
    });
    if (response.status === 429 && attempt < ITUNES_RETRY_LIMIT) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!response.ok) {
      throw new Error(`iTunes error ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }
};

const fetchItunesLookup = async (trackId: string, geo: string): Promise<boolean> => {
  const country = normalizeCountry(geo);
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(trackId)}&country=${encodeURIComponent(country)}`;
  const data = await fetchItunesJson(url);
  const resultCount = typeof data?.resultCount === "number" ? data.resultCount : null;
  if (resultCount === null) {
    throw new Error("Invalid iTunes lookup response");
  }
  return resultCount === 0;
};

const fetchAppRank = async (
  keyword: string,
  geo: string,
  appId: string,
): Promise<number | null> => {
  const country = normalizeCountry(geo);
  const targetId = normalizeTargetId(appId);
  if (!targetId) return null;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${encodeURIComponent(country)}&entity=software&limit=200`;
  const data = await fetchItunesJson(url);
  if (!data || !Array.isArray(data.results) || data.resultCount === 0) return null;

  const trimmedTarget = targetId.trim().toLowerCase();
  const index = data.results.findIndex((app: any) => {
    const appTrackId = String(app.trackId || "").trim().toLowerCase();
    const appBundleId = String(app.bundleId || "").trim().toLowerCase();
    return appTrackId === trimmedTarget || appBundleId === trimmedTarget;
  });

  return index === -1 ? null : index + 1;
};

const fetchTrafficData = async (keyword: string, geo: string): Promise<any> => {
  const apiKey = Deno.env.get("ASO_MOBILE_API_KEY");
  if (!apiKey) throw new Error("Missing ASO_MOBILE_API_KEY");

  const baseUrl = "https://app.asomobile.net/asomobile-public-api";
  const country = normalizeCountry(geo);
  const checkUrl = new URL(`${baseUrl}/keyword-check/`);
  checkUrl.searchParams.set("platform", "IOS");
  checkUrl.searchParams.set("ios_device", "IPHONE");
  checkUrl.searchParams.set("country", country);
  checkUrl.searchParams.set("keyword", keyword);

  const checkRes = await fetch(checkUrl.toString(), {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const checkText = await checkRes.text();
  const checkData = (() => {
    try {
      return JSON.parse(checkText);
    } catch {
      return null;
    }
  })();

  if (!checkRes.ok) {
    throw new Error(`ASOMobile ticket error ${checkRes.status}: ${checkText}`);
  }
  if ((checkData?.code !== 200 && checkData?.code !== 201) || !checkData?.data?.ticket_id) {
    throw new Error(`Invalid ASOMobile ticket response: ${checkText}`);
  }

  const ticketId = checkData.data.ticket_id;
  for (let i = 0; i < ASO_MAX_POLLS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, ASO_POLL_INTERVAL_MS));
    const resultUrl = new URL(`${baseUrl}/keyword-check/result`);
    resultUrl.searchParams.set("ticket_id", ticketId);
    const resultRes = await fetch(resultUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const resultText = await resultRes.text();
    const resultData = (() => {
      try {
        return JSON.parse(resultText);
      } catch {
        return null;
      }
    })();
    if (!resultRes.ok) {
      continue;
    }
    if (resultData?.code === 200 && resultData?.data?.traffic) {
      return resultData.data;
    }
  }

  throw new Error("Timeout waiting for traffic data");
};

const loadLatestAppRows = async (
  supabase: ReturnType<typeof createClient>,
  userId?: string,
  appGroup?: string,
): Promise<LatestAppRow[]> => {
  let query = supabase
    .from("aso_entries")
    .select("user_id, app_group, app_id, date, geo")
    .order("user_id", { ascending: true })
    .order("app_group", { ascending: true })
    .order("date", { ascending: false });

  if (userId) query = query.eq("user_id", userId);
  if (appGroup) query = query.eq("app_group", appGroup);

  const pageSize = 1000;
  const latestMap = new Map<string, LatestAppRow>();
  const dateValue = (raw?: string | null) => {
    if (!raw) return 0;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const rows = (data || []) as LatestAppRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.user_id || !row.app_group || !row.app_id) continue;
      const key = `${row.user_id}::${row.app_group}`;
      const existing = latestMap.get(key);
      if (!existing || dateValue(row.date) > dateValue(existing.date)) {
        latestMap.set(key, row);
      }
    }

    if (rows.length < pageSize) break;
  }

  return Array.from(latestMap.values());
};

const loadKeywordGeoPairs = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  appGroup: string,
  appId: string,
): Promise<KeywordGeo[]> => {
  const { data, error } = await supabase
    .from("aso_entries")
    .select("keyword, geo")
    .eq("user_id", userId)
    .eq("app_group", appGroup)
    .eq("app_id", appId);

  if (error) throw error;
  const map = new Map<string, KeywordGeo>();
  (data || []).forEach((row: any) => {
    const keyword = String(row.keyword || "").trim();
    const geo = String(row.geo || "").trim();
    if (!keyword || !geo) return;
    const key = `${keyword}::${geo}`;
    if (!map.has(key)) {
      map.set(key, { keyword, geo });
    }
  });
  return Array.from(map.values());
};

const loadRealtimeMap = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  appId: string,
): Promise<Map<string, { traffic: number | null; traffic_data: any }>> => {
  const { data, error } = await supabase
    .from("realtime_rankings")
    .select("keyword, geo, traffic, traffic_data")
    .eq("user_id", userId)
    .eq("app_id", appId);

  if (error) throw error;
  const map = new Map<string, { traffic: number | null; traffic_data: any }>();
  (data || []).forEach((row: any) => {
    const keyword = String(row.keyword || "").trim();
    const geo = String(row.geo || "").trim();
    if (!keyword || !geo) return;
    map.set(`${keyword}::${geo}`, {
      traffic: typeof row.traffic === "number" ? row.traffic : row.traffic ?? null,
      traffic_data: row.traffic_data ?? null,
    });
  });
  return map;
};

const loadStatusCache = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  numericIds: string[],
): Promise<Map<string, StatusRow>> => {
  if (numericIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("appstore_status_cache")
    .select("app_id,status,checked_at,updated_at")
    .eq("user_id", userId)
    .in("app_id", numericIds);
  if (error) throw error;
  const map = new Map<string, StatusRow>();
  (data || []).forEach((row: any) => {
    if (!row?.app_id || !row?.status) return;
    map.set(String(row.app_id), {
      app_id: String(row.app_id),
      status: row.status,
      checked_at: row.checked_at ?? null,
      updated_at: row.updated_at ?? null,
    });
  });
  return map;
};

const upsertStatusCache = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  appId: string,
  status: "banned" | "ok",
  nowIso: string,
  dryRun?: boolean,
) => {
  if (dryRun) return;
  const { error } = await supabase
    .from("appstore_status_cache")
    .upsert({
      user_id: userId,
      app_id: appId,
      status,
      checked_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: "user_id,app_id" });
  if (error) throw error;
};

const getGlobalApiUsage = async (supabase: ReturnType<typeof createClient>): Promise<number | null> => {
  const { data, error } = await supabase.rpc("get_global_api_usage", { service_name: "aso_mobile" });
  if (error) return null;
  if (typeof data === "number") return data;
  const parsed = Number(data);
  return Number.isFinite(parsed) ? parsed : null;
};

const incrementGlobalApiUsage = async (supabase: ReturnType<typeof createClient>): Promise<number | null> => {
  const { data, error } = await supabase.rpc("increment_global_api_usage", { service_name: "aso_mobile" });
  if (error) return null;
  if (typeof data === "number") return data;
  const parsed = Number(data);
  return Number.isFinite(parsed) ? parsed : null;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => null) as CronInput | null;
    const scheduled = body?.mode === "scheduled" || !body;

    if (scheduled) {
      const cronSecret = Deno.env.get("CRON_SECRET");
      if (!cronSecret) {
        return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
          status: 401,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      const provided = req.headers.get("x-cron-secret") ??
        new URL(req.url).searchParams.get("cron_secret");
      if (!provided || provided !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
    }

    const supabase = buildSupabaseClient();
    const startedAt = Date.now();
    const nowIso = new Date().toISOString();

    const latestRows = await loadLatestAppRows(supabase, body?.userId, body?.appGroup);
    const grouped = new Map<string, LatestAppRow[]>();
    latestRows.forEach((row) => {
      if (!row.user_id || !row.app_group || !row.app_id) return;
      if (!grouped.has(row.user_id)) grouped.set(row.user_id, []);
      grouped.get(row.user_id)!.push(row);
    });

    let trafficUsage = await getGlobalApiUsage(supabase);
    if (trafficUsage === null) trafficUsage = 0;

    let usersProcessed = 0;
    let appsProcessed = 0;
    let keywordGeosProcessed = 0;
    let ranksUpdated = 0;
    let historyInserted = 0;
    let trafficSeeded = 0;
    let bannedSkipped = 0;
    let banChecksPerformed = 0;
    let banChecksFailed = 0;
    const userErrors: { user_id: string; error: string }[] = [];

    for (const [userId, apps] of grouped.entries()) {
      usersProcessed += 1;
      try {
        const numericIds = Array.from(new Set(
          apps.map((row) => extractNumericId(row.app_id)).filter((id): id is string => !!id),
        ));
        const statusMap = await loadStatusCache(supabase, userId, numericIds);

        for (const app of apps) {
          if (body?.maxApps && appsProcessed >= body.maxApps) break;
          appsProcessed += 1;

          const numericId = extractNumericId(app.app_id);
          const statusRow = numericId ? statusMap.get(numericId) : null;
          let isBanned = false;

          if (numericId && statusRow?.status === "banned") {
            isBanned = true;
          } else if (numericId && !isOkFresh(statusRow)) {
            try {
              banChecksPerformed += 1;
              const banned = await fetchItunesLookup(numericId, app.geo || "US");
              isBanned = banned;
              await upsertStatusCache(
                supabase,
                userId,
                numericId,
                banned ? "banned" : "ok",
                nowIso,
                body?.dryRun,
              );
              statusMap.set(numericId, {
                app_id: numericId,
                status: banned ? "banned" : "ok",
                checked_at: nowIso,
                updated_at: nowIso,
              });
            } catch (error) {
              banChecksFailed += 1;
              console.warn(`[realtime-standings-cron] ban check failed user=${userId} app=${numericId}`, error);
            }
          }

          if (isBanned) {
            bannedSkipped += 1;
            continue;
          }

          const pairs = await loadKeywordGeoPairs(supabase, userId, app.app_group, app.app_id);
          const limitedPairs = body?.maxKeywordGeos
            ? pairs.slice(0, body.maxKeywordGeos)
            : pairs;

          if (limitedPairs.length === 0) continue;

          const realtimeMap = await loadRealtimeMap(supabase, userId, app.app_id);

          const rankUpdates: any[] = [];
          const historyRows: any[] = [];
          for (const pair of limitedPairs) {
            keywordGeosProcessed += 1;
            let rank: number | null = null;
            try {
              rank = await fetchAppRank(pair.keyword, pair.geo, app.app_id);
            } catch (error) {
              console.warn(`[realtime-standings-cron] rank fetch failed user=${userId} app=${app.app_id}`, error);
            }

            rankUpdates.push({
              user_id: userId,
              app_id: app.app_id,
              keyword: pair.keyword,
              geo: pair.geo,
              rank,
              last_updated: nowIso,
            });

            const existing = realtimeMap.get(`${pair.keyword}::${pair.geo}`);
            historyRows.push({
              user_id: userId,
              app_id: app.app_id,
              keyword: pair.keyword,
              geo: pair.geo,
              rank,
              traffic: existing?.traffic ?? null,
              captured_at: nowIso,
            });
          }

          if (!body?.dryRun && rankUpdates.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < rankUpdates.length; i += batchSize) {
              const batch = rankUpdates.slice(i, i + batchSize);
              const { error } = await supabase
                .from("realtime_rankings")
                .upsert(batch, {
                  onConflict: "user_id,app_id,keyword,geo",
                  ignoreDuplicates: false,
                });
              if (error) throw error;
            }
          }
          ranksUpdated += rankUpdates.length;

          if (!body?.dryRun && historyRows.length > 0) {
            const batchSize = 500;
            for (let i = 0; i < historyRows.length; i += batchSize) {
              const batch = historyRows.slice(i, i + batchSize);
              const { error } = await supabase
                .from("realtime_rankings_history")
                .insert(batch);
              if (error) throw error;
            }
          }
          historyInserted += historyRows.length;

          for (const pair of limitedPairs) {
            if (trafficUsage >= TRAFFIC_REQUEST_LIMIT) break;
            const key = `${pair.keyword}::${pair.geo}`;
            const existing = realtimeMap.get(key);
            if (existing && typeof existing.traffic === "number") continue;

            try {
              const trafficData = await fetchTrafficData(pair.keyword, pair.geo);
              const trafficValue = trafficData?.traffic?.value ?? null;
              if (!body?.dryRun) {
                const { error } = await supabase
                  .from("realtime_rankings")
                  .upsert({
                    user_id: userId,
                    app_id: app.app_id,
                    keyword: pair.keyword,
                    geo: pair.geo,
                    traffic: typeof trafficValue === "number" ? trafficValue : null,
                    traffic_data: trafficData ?? null,
                    last_updated: nowIso,
                  }, { onConflict: "user_id,app_id,keyword,geo" });
                if (error) throw error;
                const newCount = await incrementGlobalApiUsage(supabase);
                if (typeof newCount === "number") trafficUsage = newCount;
              }
              trafficSeeded += 1;
            } catch (error) {
              console.warn(`[realtime-standings-cron] traffic fetch failed user=${userId} app=${app.app_id}`, error);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        userErrors.push({ user_id: userId, error: message });
        console.error(`[realtime-standings-cron] user=${userId} error`, error);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      scheduled: scheduled,
      dryRun: !!body?.dryRun,
      usersProcessed,
      appsProcessed,
      keywordGeosProcessed,
      ranksUpdated,
      historyInserted,
      trafficSeeded,
      bannedSkipped,
      banChecksPerformed,
      banChecksFailed,
      trafficUsage,
      userErrors,
      durationMs: Date.now() - startedAt,
    }), { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[realtime-standings-cron] error", error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
