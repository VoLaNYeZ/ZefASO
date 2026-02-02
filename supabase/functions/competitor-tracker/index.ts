import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { CONFUSABLE_ASCII_CODEPOINTS } from "./confusables_ascii.ts";
import { normalizeGeoInput, toIsoCountryCode } from "../_shared/geo.ts";

const ALLOWED_ORIGINS = [
  "https://zefaso.tech",
  "https://www.zefaso.tech",
  "http://localhost:3000",
  "http://localhost:5173",
];

const ITUNES_RATE_LIMIT_MS = 3200;
const BAN_CHECK_TTL_MS = 1000 * 60 * 60 * 24 * 3;
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

type TargetAppInput = {
  appName: string;
  appId?: string;
  bundleId?: string;
  keywords?: string[];
  geos?: string[];
  keywordGeoPairs?: { keyword: string; geo: string }[];
  aliases?: string[];
  developerNames?: string[];
  minScore?: number;
  enablePotential?: boolean;
  enableKeywordMatch?: boolean;
};

type TrackerInput = {
  apps?: TargetAppInput[];
  minScore?: number;
  maxResultsPerKeyword?: number;
  maxKeywordGeos?: number;
  maxMatchesPerApp?: number;
  aggressive?: boolean;
  dryRun?: boolean;
  stopWords?: string[];
  enablePotential?: boolean;
  enableKeywordMatch?: boolean;
  mode?: "scheduled";
  userId?: string;
  targetAppName?: string;
  storeResults?: boolean;
};

type ItunesApp = {
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  sellerName?: string;
  primaryGenreName?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  artworkUrl512?: string;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
};

type NormalizedName = {
  raw: string;
  normalized: string;
  tokens: string[];
  skeleton: string;
  brandTokens: string[];
};

type PreparedTarget = {
  key: string;
  appName: string;
  appId?: string;
  bundleId?: string;
  keywords: string[];
  geos: string[];
  keywordGeoSet: Set<string>;
  minScore: number;
  developerNames: string[];
  names: NormalizedName[];
  brandTokens: Set<string>;
  enablePotential: boolean;
  enableKeywordMatch: boolean;
};

type MatchSignal = {
  jaroWinkler: number;
  levenshtein: number;
  ngramCosine: number;
  prefixMatch: boolean;
  suffixMatch: boolean;
  tokenOverlap: boolean;
  exactSkeletonMatch: boolean;
  sellerMatch: boolean;
  keywordMatch?: boolean;
};

type MatchResult = {
  targetKey: string;
  targetAppName: string;
  targetAppId?: string;
  targetBundleId?: string;
  candidateKey: string;
  candidate: {
    trackId?: number;
    trackName?: string;
    bundleId?: string;
    sellerName?: string;
    primaryGenreName?: string;
    trackViewUrl?: string;
    artworkUrl?: string;
    releaseDate?: string;
    currentVersionReleaseDate?: string;
  };
  score: number;
  signals: MatchSignal;
  foundIn: { keyword: string; geo: string; rank: number }[];
  isPotential: boolean;
  potentialReason?: string | null;
};

type ScanOptions = {
  maxResultsPerKeyword: number;
  maxKeywordGeos: number;
  maxMatchesPerApp: number;
  aggressive: boolean;
  defaultMinScore: number;
  enablePotential: boolean;
  enableKeywordMatch: boolean;
};

type ScanResult = {
  matches: MatchResult[];
  scannedKeywordGeos: number;
  estimatedRequests: number;
  totalAppsScanned: number;
};

type CompetitorTargetRow = {
  id: string;
  user_id: string;
  app_name: string;
  app_id?: string | null;
  bundle_id?: string | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  geos?: string[] | null;
  keyword_geo_pairs?: string[] | null;
  developer_names?: string[] | null;
  min_score?: number | null;
  is_active?: boolean | null;
  enable_potential?: boolean | null;
  enable_keyword_match?: boolean | null;
};

const DEFAULT_STOPWORDS = new Set([
  "app",
  "apps",
  "pro",
  "lite",
  "free",
  "the",
  "and",
  "for",
  "mobile",
  "official",
  "studio",
  "vpn",
  "ai",
  "tool",
  "tools",
  "editor",
  "photo",
  "video",
  "music",
  "game",
  "games",
  "videochat",
  "plus",
]);

const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\uFE00-\uFE0F]/g;
const DIACRITICS_RE = /[\u0300-\u036F]/g;
const NON_WORD_RE = /[^\p{L}\p{N}]+/gu;
const LETTER_RE = /\p{L}/u;
const LATIN_RE = /\p{Script=Latin}/u;

const CONFUSABLES: Record<string, string> = {
  "\u0430": "a",
  "\u0432": "b",
  "\u0435": "e",
  "\u043E": "o",
  "\u043F": "n",
  "\u0440": "p",
  "\u0441": "c",
  "\u0443": "y",
  "\u0445": "x",
  "\u043C": "m",
  "\u043D": "h",
  "\u043A": "k",
  "\u0442": "t",
  "\u043B": "l",
  "\u0438": "i",
  "\u0456": "i",
  "\u0433": "r",
  "\u0455": "s",
  "\u0448": "w",
  "\u0458": "j",
  "\u0454": "e",
  "\u0437": "z",
  "\u044D": "e",
  "\u03B1": "a",
  "\u03B2": "b",
  "\u03B5": "e",
  "\u03BF": "o",
  "\u03C0": "n",
  "\u03C1": "p",
  "\u03C4": "t",
  "\u03C5": "y",
  "\u03C7": "x",
  "\u03BD": "v",
  "\u03BA": "k",
  "\u03BB": "l",
  "\u03B9": "i",
  "\u03BC": "m",
  "\u03B7": "h",
  "\u03B6": "z",
  "\u03C2": "s",
  "\u03C3": "s",
};

const EXTRA_CONFUSABLE_CODEPOINTS = new Set<number>([
  0x043f, // CYRILLIC SMALL LETTER PE -> n
  0x03c0, // GREEK SMALL LETTER PI -> n
  0x0458, // CYRILLIC SMALL LETTER JE -> j
  0x0454, // CYRILLIC SMALL LETTER UKRAINIAN IE -> e
  0x0437, // CYRILLIC SMALL LETTER ZE -> z
  0x044d, // CYRILLIC SMALL LETTER E -> e
  0x03b7, // GREEK SMALL LETTER ETA -> h
  0x03b6, // GREEK SMALL LETTER ZETA -> z
  0x03c2, // GREEK SMALL LETTER FINAL SIGMA -> s
  0x03c3, // GREEK SMALL LETTER SIGMA -> s
]);

const DIGIT_CONFUSABLES: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
};

const getFirstEnv = (keys: string[]): string => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing env var (any of): ${keys.join(", ")}`);
};

const buildAnonClient = (authHeader: string) => {
  const supabaseUrl = getFirstEnv(["SUPABASE_URL", "PROJECT_URL"]);
  const anonKey = getFirstEnv(["SUPABASE_ANON_KEY", "ANON_KEY"]);
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getUserContext = async (req: Request) => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return { error: "Missing Authorization" } as const;

  const supabase = buildAnonClient(`Bearer ${token}`);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: "Unauthorized" } as const;

  return { supabase, userId: data.user.id } as const;
};

const caseFold = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\u00DF/g, "ss")
    .replace(/\u0131/g, "i")
    .replace(/\u017F/g, "s");

const cleanForTokens = (raw: string): string => {
  const nfkc = raw.normalize("NFKC");
  const noInvisible = nfkc.replace(INVISIBLE_RE, "");
  const lower = caseFold(noInvisible);
  const deaccented = lower.normalize("NFKD").replace(DIACRITICS_RE, "");
  return deaccented.replace(NON_WORD_RE, " ").trim();
};

const toSkeletonToken = (token: string, aggressive: boolean): string => {
  let out = "";
  for (const ch of token) {
    const mapped = CONFUSABLES[ch] ?? (aggressive ? DIGIT_CONFUSABLES[ch] : undefined) ?? ch;
    out += mapped;
  }
  return out.replace(NON_WORD_RE, "");
};

const buildStopWords = (custom?: string[]): Set<string> => {
  const merged = new Set(DEFAULT_STOPWORDS);
  if (!Array.isArray(custom)) return merged;
  custom.forEach((raw) => {
    const cleaned = cleanForTokens(String(raw || ""));
    if (!cleaned) return;
    cleaned.split(/\s+/).forEach((token) => {
      if (token) merged.add(token);
    });
  });
  return merged;
};

const normalizeName = (raw: string, aggressive: boolean, stopWords: Set<string>): NormalizedName => {
  const cleaned = cleanForTokens(raw || "");
  const tokensRaw = cleaned ? cleaned.split(/\s+/) : [];
  const skeletonTokens = tokensRaw.map((t) => toSkeletonToken(t, aggressive)).filter(Boolean);
  const skeleton = skeletonTokens.join("");
  const brandTokens = skeletonTokens.filter((t) => t.length >= 3 && !stopWords.has(t));

  return {
    raw: raw || "",
    normalized: cleaned,
    tokens: skeletonTokens,
    skeleton,
    brandTokens,
  };
};

const detectPotentialConfusable = (raw: string): { isPotential: boolean; reason: string | null } => {
  if (!raw) return { isPotential: false, reason: null };
  const normalized = raw.normalize("NFKC");
  let hasConfusable = false;
  const scriptHints = new Set<string>();

  for (const ch of normalized) {
    if (!LETTER_RE.test(ch)) continue;
    if (LATIN_RE.test(ch)) continue;
    const code = ch.codePointAt(0);
    if (!code || (!CONFUSABLE_ASCII_CODEPOINTS.has(code) && !EXTRA_CONFUSABLE_CODEPOINTS.has(code))) continue;
    hasConfusable = true;
    if (/\p{Script=Cyrillic}/u.test(ch)) scriptHints.add("cyrillic");
    else if (/\p{Script=Greek}/u.test(ch)) scriptHints.add("greek");
    else scriptHints.add("nonlatin");
  }

  if (!hasConfusable) return { isPotential: false, reason: null };
  const reason = scriptHints.size > 0
    ? `confusable:${Array.from(scriptHints).sort().join("+")}`
    : "confusable";
  return { isPotential: true, reason };
};

const normalizeId = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
};

const hasTokenOverlap = (candidateTokens: string[], targetTokens: Set<string>): boolean => {
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) return true;
  }
  return false;
};

const jaroWinkler = (a: string, b: string): number => {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let bIndex = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[bIndex]) bIndex++;
    if (a[i] !== b[bIndex]) transpositions++;
    bIndex++;
  }

  const m = matches;
  const jaro = ((m / aLen) + (m / bLen) + ((m - transpositions / 2) / m)) / 3;
  const prefixLimit = 4;
  let prefix = 0;
  for (let i = 0; i < Math.min(prefixLimit, aLen, bLen); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
};

const levenshteinRatio = (a: string, b: string): number => {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const dp = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) dp[j] = j;

  for (let i = 1; i <= aLen; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  const dist = dp[bLen];
  return 1 - dist / Math.max(aLen, bLen);
};

const ngramCosine = (a: string, b: string): number => {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const n = Math.max(2, Math.min(3, Math.min(aLen, bLen)));
  const freq = (value: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i <= value.length - n; i++) {
      const gram = value.slice(i, i + n);
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  };

  const fa = freq(a);
  const fb = freq(b);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const count of fa.values()) normA += count * count;
  for (const count of fb.values()) normB += count * count;
  for (const [key, count] of fa.entries()) {
    const bCount = fb.get(key) || 0;
    dot += count * bCount;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
};

const scoreNames = (
  target: PreparedTarget,
  candidate: NormalizedName,
  minScore: number,
): { score: number; signals: MatchSignal } | null => {
  if (!candidate.skeleton || candidate.skeleton.length < 3) return null;
  const tokenOverlap = hasTokenOverlap(candidate.tokens, target.brandTokens);

  let bestScore = 0;
  let bestSignals: MatchSignal | null = null;

  for (const name of target.names) {
    const t = name.skeleton;
    if (!t) continue;

    const variants = [
      { value: candidate.skeleton, isToken: false },
      ...candidate.tokens.map((token) => ({ value: token, isToken: true })),
    ];

    for (const variant of variants) {
      const c = variant.value;
      if (!c) continue;
      if (variant.isToken && c.length < 3) continue;

      const prefixMatch = t.slice(0, 3) === c.slice(0, 3);
      const suffixMatch = t.slice(-3) === c.slice(-3);

      const lenDiff = Math.abs(t.length - c.length);
      if (!tokenOverlap && !prefixMatch && !suffixMatch && lenDiff > 4) {
        continue;
      }

      const jw = jaroWinkler(t, c);
      const lev = levenshteinRatio(t, c);
      const ngram = ngramCosine(t, c);

      let score = jw * 0.55 + ngram * 0.3 + lev * 0.15;

      if (prefixMatch) score += 0.02;
      if (suffixMatch) score += 0.02;
      if (prefixMatch && suffixMatch) score += 0.02;
      if (tokenOverlap) score += 0.03;

      if (Math.min(t.length, c.length) < 6) score -= 0.03;

      if (!tokenOverlap) {
        score -= 0.02;
      }

      score = Math.max(0, Math.min(1, score));
      if (score < bestScore) continue;

      bestScore = score;
      bestSignals = {
        jaroWinkler: jw,
        levenshtein: lev,
        ngramCosine: ngram,
        prefixMatch,
        suffixMatch,
        tokenOverlap,
        exactSkeletonMatch: t === c,
        sellerMatch: false,
      };
    }
  }

  if (!bestSignals) return null;

  const requiredScore = tokenOverlap ? minScore : minScore + 0.05;
  if (bestScore < requiredScore) return null;

  return { score: bestScore, signals: bestSignals };
};

const fetchItunes = async (
  keyword: string,
  geo: string,
  limit: number,
): Promise<ItunesApp[]> => {
  const country = toIsoCountryCode(geo);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${encodeURIComponent(country)}&entity=software&limit=${limit}`;
  let attempt = 0;
  while (true) {
    attempt++;
    await scheduleRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZeyfASO/1.0)" },
    });
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!response.ok) {
      throw new Error(`iTunes error ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.results)) return [];
    return data.results as ItunesApp[];
  }
};

const fetchItunesLookup = async (
  trackId: string,
  geo: string,
): Promise<boolean | null> => {
  const country = toIsoCountryCode(geo);
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(trackId)}&country=${encodeURIComponent(country)}`;
  let attempt = 0;
  while (true) {
    attempt++;
    await scheduleRateLimit();
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZeyfASO/1.0)" },
    });
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const resultCount = typeof data?.resultCount === "number" ? data.resultCount : null;
    if (resultCount === null) return null;
    return resultCount === 0;
  }
};

const runWithLimit = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let index = 0;
  const workers = Array.from({ length: limit }).map(async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(workers);
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const buildKeywordSignature = (
  keyword: string,
  aggressive: boolean,
  stopWords: Set<string>,
) => {
  const normalized = normalizeName(keyword, aggressive, stopWords);
  const tokens = normalized.tokens.filter((t) => t.length >= 3);
  return { tokens, skeleton: normalized.skeleton };
};

const filterKeywordTokensForTarget = (
  keywordTokens: string[],
  target: PreparedTarget,
  stopWords: Set<string>,
): string[] => {
  if (keywordTokens.length === 0) return [];
  return keywordTokens.filter((token) => {
    if (!token) return false;
    if (stopWords.has(token)) return false;
    if (token.length <= 3) {
      if (/\d/.test(token)) return true;
      return target.brandTokens.has(token);
    }
    return true;
  });
};

const hasKeywordMatch = (
  candidate: NormalizedName,
  keywordTokens: string[],
  keywordSkeleton: string,
): boolean => {
  if (keywordTokens.length === 0) return false;
  const candidateTokenSet = new Set(candidate.tokens);
  if (keywordTokens.length === 1) {
    const token = keywordTokens[0];
    if (candidateTokenSet.has(token)) return true;
    return keywordSkeleton ? candidate.skeleton.includes(keywordSkeleton) : false;
  }
  return keywordTokens.every((token) => candidateTokenSet.has(token));
};

const parseKeywordGeoPair = (raw: string): { keyword: string; geo: string } | null => {
  if (!raw) return null;
  const parts = raw.split("::");
  if (parts.length < 2) return null;
  const geoRaw = parts.pop() || "";
  const keywordRaw = parts.join("::");
  const keyword = keywordRaw.trim();
  const geo = normalizeGeoInput(geoRaw.trim());
  if (!keyword || !geo) return null;
  return { keyword, geo };
};

const normalizeKeywordGeoPairs = (
  value: unknown,
): { keyword: string; geo: string }[] => {
  if (!Array.isArray(value)) return [];
  const out: { keyword: string; geo: string }[] = [];
  value.forEach((item) => {
    if (typeof item === "string") {
      const parsed = parseKeywordGeoPair(item.trim());
      if (parsed) out.push(parsed);
      return;
    }
    if (item && typeof item === "object") {
      const keyword = typeof (item as any).keyword === "string" ? (item as any).keyword.trim() : "";
      const geoRaw = typeof (item as any).geo === "string" ? (item as any).geo.trim() : "";
      const geo = normalizeGeoInput(geoRaw);
      if (keyword && geo) out.push({ keyword, geo });
    }
  });
  return out;
};

const prepareTargets = (
  apps: TargetAppInput[],
  options: ScanOptions,
  stopWords: Set<string>,
): { prepared: PreparedTarget[]; keywordGeos: { keyword: string; geo: string }[] } => {
  const prepared: PreparedTarget[] = [];
  const keywordGeoMap = new Map<string, { keyword: string; geo: string }>();

  for (const app of apps) {
    if (!app || !app.appName) {
      continue;
    }

    const keywordGeoPairs = normalizeKeywordGeoPairs(app.keywordGeoPairs);
    const keywords = Array.from(new Set((app.keywords || []).map((k) => (k || "").trim()).filter(Boolean)));
    const geos = Array.from(new Set((app.geos || []).map((g) => normalizeGeoInput(g)).filter(Boolean)));

    const pairs = keywordGeoPairs.length > 0
      ? keywordGeoPairs
      : keywords.flatMap((keyword) => geos.map((geo) => ({ keyword, geo })));

    if (pairs.length === 0) continue;

    const keywordsFromPairs = Array.from(new Set(pairs.map((p) => p.keyword)));
    const geosFromPairs = Array.from(new Set(pairs.map((p) => p.geo)));

    pairs.forEach(({ keyword, geo }) => {
      const key = `${keyword}::${geo}`;
      if (!keywordGeoMap.has(key)) {
        keywordGeoMap.set(key, { keyword, geo });
      }
    });

    const names = [app.appName, ...(app.aliases || [])]
      .map((name) => normalizeName(name, options.aggressive, stopWords));

    const brandTokens = new Set<string>();
    for (const name of names) {
      for (const token of name.brandTokens) {
        brandTokens.add(token);
      }
    }

    const minScore = app.minScore ?? options.defaultMinScore;
    const appIdKey = normalizeId(app.appId) || normalizeId(app.bundleId) || "noid";
    const appKey = `${app.appName}::${appIdKey}`;
    const keywordGeoSet = new Set(pairs.map((p) => `${p.keyword}::${p.geo}`));
    const enablePotential = typeof app.enablePotential === "boolean"
      ? app.enablePotential
      : options.enablePotential;
    const enableKeywordMatch = typeof app.enableKeywordMatch === "boolean"
      ? app.enableKeywordMatch
      : options.enableKeywordMatch;

    prepared.push({
      key: appKey,
      appName: app.appName,
      appId: app.appId,
      bundleId: app.bundleId,
      keywords: keywordsFromPairs,
      geos: geosFromPairs,
      keywordGeoSet,
      minScore,
      developerNames: (app.developerNames || []).map((n) => cleanForTokens(n)),
      names,
      brandTokens,
      enablePotential,
      enableKeywordMatch,
    });
  }

  const keywordGeos = Array.from(keywordGeoMap.values()).slice(0, options.maxKeywordGeos);
  return { prepared, keywordGeos };
};

const scanTargets = async (
  apps: TargetAppInput[],
  options: ScanOptions,
  stopWords: Set<string>,
  dryRun: boolean,
): Promise<ScanResult> => {
  const { prepared, keywordGeos } = prepareTargets(apps, options, stopWords);
  const estimatedRequests = keywordGeos.length;
  const shouldDetectPotential = prepared.some((target) => target.enablePotential);

  if (dryRun) {
    return {
      matches: [],
      scannedKeywordGeos: keywordGeos.length,
      estimatedRequests,
      totalAppsScanned: 0,
    };
  }

  const resultsByKeywordGeo = new Map<string, ItunesApp[]>();
  await runWithLimit(keywordGeos, 3, async ({ keyword, geo }) => {
    const key = `${keyword}::${geo}`;
    const results = await fetchItunes(keyword, geo, options.maxResultsPerKeyword);
    resultsByKeywordGeo.set(key, results);
  });

  const matchesMap = new Map<string, MatchResult>();
  let totalAppsScanned = 0;

  for (const { keyword, geo } of keywordGeos) {
    const key = `${keyword}::${geo}`;
    const list = resultsByKeywordGeo.get(key) || [];
    totalAppsScanned += list.length;
    const keywordSignature = buildKeywordSignature(keyword, options.aggressive, stopWords);
    const keywordTokens = keywordSignature.tokens;
    const keywordSkeleton = keywordSignature.skeleton;
    const keywordTokensByTarget = new Map<string, { tokens: string[]; skeleton: string }>();
    if (keywordTokens.length > 0) {
      for (const target of prepared) {
        if (!target.enableKeywordMatch) continue;
        const filtered = filterKeywordTokensForTarget(keywordTokens, target, stopWords);
        if (filtered.length === 0) continue;
        keywordTokensByTarget.set(target.key, { tokens: filtered, skeleton: keywordSkeleton });
      }
    }

    list.forEach((candidateRaw, index) => {
      const candidateName = candidateRaw.trackName || "";
      if (!candidateName) return;

      const potential = shouldDetectPotential
        ? detectPotentialConfusable(candidateName)
        : { isPotential: false, reason: null };
      const normalizedCandidate = normalizeName(candidateName, options.aggressive, stopWords);
      if (!normalizedCandidate.skeleton) return;

      const rank = index + 1;

      for (const target of prepared) {
        if (!target.keywordGeoSet.has(key)) continue;
        const targetId = normalizeId(target.appId) || normalizeId(target.bundleId || "");
        const candidateTrackId = candidateRaw.trackId ? String(candidateRaw.trackId) : "";
        const candidateBundleId = candidateRaw.bundleId ? candidateRaw.bundleId.toLowerCase() : "";

        if (targetId && (candidateTrackId === targetId || candidateBundleId === targetId)) {
          continue;
        }

        if (target.bundleId && candidateBundleId === target.bundleId.toLowerCase()) {
          continue;
        }

        let best = scoreNames(target, normalizedCandidate, target.minScore);
        if (!best && target.enableKeywordMatch) {
          const keywordEntry = keywordTokensByTarget.get(target.key);
          const keywordMatch = keywordEntry
            ? hasKeywordMatch(normalizedCandidate, keywordEntry.tokens, keywordEntry.skeleton)
            : false;
          if (keywordMatch) {
            const keywordScore = Math.max(0.6, Math.min(0.8, target.minScore - 0.15));
            best = {
              score: keywordScore,
              signals: {
                jaroWinkler: 0,
                levenshtein: 0,
                ngramCosine: 0,
                prefixMatch: false,
                suffixMatch: false,
                tokenOverlap: false,
                exactSkeletonMatch: false,
                sellerMatch: false,
                keywordMatch: true,
              },
            };
          }
        }
        if (!best) continue;

        const seller = candidateRaw.sellerName || "";
        const normalizedSeller = seller ? cleanForTokens(seller) : "";
        const sellerMatch = normalizedSeller &&
          target.developerNames.some((name) => name === normalizedSeller);
        best.signals.sellerMatch = sellerMatch;

        const candidateKey = candidateTrackId || candidateBundleId || candidateName;
        const matchKey = `${target.key}::${candidateKey}`;
        const artworkUrl = candidateRaw.artworkUrl100 ||
          candidateRaw.artworkUrl512 ||
          candidateRaw.artworkUrl60 ||
          "";

        const existing = matchesMap.get(matchKey);
        const foundEntry = { keyword, geo, rank };

        if (!existing) {
          matchesMap.set(matchKey, {
            targetKey: target.key,
            targetAppName: target.appName,
            targetAppId: target.appId,
            targetBundleId: target.bundleId,
            candidateKey,
            candidate: {
              trackId: candidateRaw.trackId,
              trackName: candidateRaw.trackName,
              bundleId: candidateRaw.bundleId,
              sellerName: candidateRaw.sellerName,
              primaryGenreName: candidateRaw.primaryGenreName,
              trackViewUrl: candidateRaw.trackViewUrl,
              artworkUrl,
              releaseDate: candidateRaw.releaseDate,
              currentVersionReleaseDate: candidateRaw.currentVersionReleaseDate,
            },
            score: best.score,
            signals: best.signals,
            foundIn: [foundEntry],
            isPotential: target.enablePotential ? potential.isPotential : false,
            potentialReason: target.enablePotential ? potential.reason : null,
          });
          continue;
        }

        const hasFound = existing.foundIn.some((entry) =>
          entry.keyword === keyword && entry.geo === geo
        );
        if (!hasFound) {
          existing.foundIn.push(foundEntry);
        }

        if (best.score > existing.score) {
          existing.score = best.score;
          existing.signals = best.signals;
        }
        if (target.enablePotential && potential.isPotential) {
          existing.isPotential = true;
          existing.potentialReason = existing.potentialReason || potential.reason;
        }
      }
    });
  }

  const perTargetCount = new Map<string, number>();
  const matches = Array.from(matchesMap.values())
    .sort((a, b) => b.score - a.score)
    .reduce<MatchResult[]>((acc, entry) => {
      const count = perTargetCount.get(entry.targetKey) || 0;
      if (count < options.maxMatchesPerApp) {
        acc.push(entry);
        perTargetCount.set(entry.targetKey, count + 1);
      }
      return acc;
    }, []);

  return {
    matches,
    scannedKeywordGeos: keywordGeos.length,
    estimatedRequests,
    totalAppsScanned,
  };
};

const buildSupabaseClient = () => {
  const supabaseUrl = getFirstEnv(["SUPABASE_URL", "PROJECT_URL"]);
  const serviceRoleKey = getFirstEnv(["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const upsertDetections = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  matches: MatchResult[],
  nowIso: string,
): Promise<number> => {
  if (!matches.length) return 0;
  const existingMap = new Map<string, { isPotential: boolean; potentialReason: string | null }>();
  const targetKeys = Array.from(new Set(matches.map((match) => match.targetKey)));
  const candidateKeys = Array.from(new Set(matches.map((match) => match.candidateKey)));
  const existingBatches: {
    target_key: string;
    candidate_key: string;
    is_potential: boolean;
    potential_reason: string | null;
  }[] = [];

  const batchSize = 200;
  for (let i = 0; i < candidateKeys.length; i += batchSize) {
    const batchCandidates = candidateKeys.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("competitor_detections")
      .select("target_key,candidate_key,is_potential,potential_reason")
      .eq("user_id", userId)
      .in("candidate_key", batchCandidates)
      .in("target_key", targetKeys);
    if (error) throw error;
    if (Array.isArray(data)) {
      existingBatches.push(...data as any[]);
    }
  }

  existingBatches.forEach((row) => {
    const key = `${row.target_key}::${row.candidate_key}`;
    existingMap.set(key, {
      isPotential: !!row.is_potential,
      potentialReason: row.potential_reason ?? null,
    });
  });

  const scanId = crypto.randomUUID();
  const payload = matches.map((match) => {
    const existing = existingMap.get(`${match.targetKey}::${match.candidateKey}`);
    const isPotential = typeof existing?.isPotential === "boolean"
      ? existing.isPotential
      : (match.isPotential || false);
    const potentialReason = isPotential
      ? (existing?.potentialReason ?? match.potentialReason ?? null)
      : null;

    return ({
    user_id: userId,
    target_key: match.targetKey,
    target_app_name: match.targetAppName,
    target_app_id: match.targetAppId ?? null,
    target_bundle_id: match.targetBundleId ?? null,
    candidate_key: match.candidateKey,
    candidate_track_id: match.candidate.trackId ? String(match.candidate.trackId) : null,
    candidate_bundle_id: match.candidate.bundleId ?? null,
    candidate_name: match.candidate.trackName ?? "",
    candidate_seller: match.candidate.sellerName ?? null,
    candidate_genre: match.candidate.primaryGenreName ?? null,
    candidate_url: match.candidate.trackViewUrl ?? null,
    candidate_artwork_url: match.candidate.artworkUrl ?? null,
    candidate_release_date: match.candidate.releaseDate ?? null,
    candidate_update_date: match.candidate.currentVersionReleaseDate ?? null,
    score: match.score,
    signals: match.signals,
    found_in: match.foundIn,
    is_potential: isPotential,
    potential_reason: potentialReason,
    last_seen_at: nowIso,
    last_scan_id: scanId,
    });
  });

  const upsertBatchSize = 500;
  for (let i = 0; i < payload.length; i += upsertBatchSize) {
    const batch = payload.slice(i, i + upsertBatchSize);
    const { error } = await supabase
      .from("competitor_detections")
      .upsert(batch, {
        onConflict: "user_id,target_key,candidate_key",
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }

  return payload.length;
};

const loadTargetsByUser = async (
  supabase: ReturnType<typeof createClient>,
  userId?: string,
  targetAppName?: string,
): Promise<Map<string, TargetAppInput[]>> => {
  let query = supabase
    .from("competitor_targets")
    .select("*")
    .eq("is_active", true);

  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (targetAppName) {
    query = query.eq("app_name", targetAppName);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as CompetitorTargetRow[];
  const map = new Map<string, TargetAppInput[]>();

  rows.forEach((row) => {
    const keywords = normalizeStringArray(row.keywords);
    const geos = normalizeStringArray(row.geos);
    const keywordGeoPairs = normalizeKeywordGeoPairs(row.keyword_geo_pairs);
    if (!row.app_name) return;
    if (keywordGeoPairs.length === 0 && (keywords.length === 0 || geos.length === 0)) return;

    const target: TargetAppInput = {
      appName: row.app_name,
      appId: row.app_id || undefined,
      bundleId: row.bundle_id || undefined,
      aliases: normalizeStringArray(row.aliases),
      keywords,
      geos,
      keywordGeoPairs,
      developerNames: normalizeStringArray(row.developer_names),
      minScore: row.min_score ?? undefined,
      enablePotential: !!row.enable_potential,
      enableKeywordMatch: !!row.enable_keyword_match,
    };

    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id)!.push(target);
  });

  return map;
};

type BanCandidateRow = {
  id: string;
  candidate_track_id?: string | null;
  found_in?: { keyword: string; geo: string; rank: number }[] | null;
};

const pickGeoFromFoundIn = (foundIn: BanCandidateRow["found_in"]): string => {
  if (Array.isArray(foundIn)) {
    for (const entry of foundIn) {
      const geo = normalizeGeoInput((entry as any)?.geo ?? "");
      if (geo) return geo;
    }
  }
  return "US";
};

const refreshBannedStatuses = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  targetAppNames: string[],
  nowIso: string,
): Promise<{ checked: number; updated: number }> => {
  if (!Array.isArray(targetAppNames) || targetAppNames.length === 0) {
    return { checked: 0, updated: 0 };
  }

  const cutoffIso = new Date(Date.now() - BAN_CHECK_TTL_MS).toISOString();
  const rows: BanCandidateRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < targetAppNames.length; i += batchSize) {
    const batch = targetAppNames.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("competitor_detections")
      .select("id,candidate_track_id,found_in,banned_checked_at")
      .eq("user_id", userId)
      .in("target_app_name", batch)
      .not("candidate_track_id", "is", null)
      .or(`banned_checked_at.is.null,banned_checked_at.lt.${cutoffIso}`);
    if (error) throw error;
    if (Array.isArray(data)) rows.push(...(data as BanCandidateRow[]));
  }

  const statusCache = new Map<string, boolean>();
  const bannedIds: string[] = [];
  const okIds: string[] = [];

  for (const row of rows) {
    const trackId = typeof row.candidate_track_id === "string" ? row.candidate_track_id.trim() : "";
    if (!trackId) continue;
    const geo = pickGeoFromFoundIn(row.found_in);
    const cacheKey = `${trackId}::${geo}`;
    let isBanned = statusCache.get(cacheKey);
    if (typeof isBanned !== "boolean") {
      const result = await fetchItunesLookup(trackId, geo);
      if (typeof result !== "boolean") continue;
      isBanned = result;
      statusCache.set(cacheKey, isBanned);
    }
    if (isBanned) bannedIds.push(row.id);
    else okIds.push(row.id);
  }

  const updateBatch = async (ids: string[], isBanned: boolean) => {
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("competitor_detections")
        .update({ is_banned: isBanned, banned_checked_at: nowIso })
        .eq("user_id", userId)
        .in("id", chunk);
      if (error) throw error;
    }
  };

  if (bannedIds.length > 0) await updateBatch(bannedIds, true);
  if (okIds.length > 0) await updateBatch(okIds, false);

  return { checked: rows.length, updated: bannedIds.length + okIds.length };
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => null) as TrackerInput | null;
    const hasApps = Array.isArray(body?.apps) && body!.apps!.length > 0;
    const runStoredTargets = body?.mode === "scheduled" || !hasApps;

    const maxResultsPerKeyword = Math.max(10, Math.min(200, body?.maxResultsPerKeyword || 200));
    const maxKeywordGeos = Math.max(1, Math.min(500, body?.maxKeywordGeos || 200));
    const maxMatchesPerApp = Math.max(5, Math.min(200, body?.maxMatchesPerApp || 50));
    const aggressive = !!body?.aggressive;
    const defaultMinScore = body?.minScore ?? 0.86;
    const stopWords = buildStopWords(body?.stopWords);

  const options: ScanOptions = {
    maxResultsPerKeyword,
    maxKeywordGeos,
    maxMatchesPerApp,
    aggressive,
    defaultMinScore,
    enablePotential: !!body?.enablePotential,
    enableKeywordMatch: !!body?.enableKeywordMatch,
  };

    if (!runStoredTargets) {
      const apps = body?.apps ?? [];
      if (apps.length === 0) {
        return new Response(JSON.stringify({ error: "Missing apps payload" }), {
          status: 400,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }

      const userContext = await getUserContext(req);
      if ("error" in userContext) {
        return new Response(JSON.stringify({ error: userContext.error }), {
          status: 401,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }

      const scan = await scanTargets(apps, options, stopWords, !!body?.dryRun);
      const nowIso = new Date().toISOString();
      let detectionsUpserted = 0;
      if (body?.storeResults) {
        if (!body?.dryRun) {
          detectionsUpserted = await upsertDetections(
            userContext.supabase,
            userContext.userId,
            scan.matches,
            nowIso,
          );
          try {
            await refreshBannedStatuses(
              userContext.supabase,
              userContext.userId,
              apps.map((app) => app.appName).filter(Boolean),
              nowIso,
            );
          } catch (banError) {
            console.error("[competitor-tracker] ban refresh failed", banError);
          }
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: !!body?.dryRun,
          scannedKeywordGeos: scan.scannedKeywordGeos,
          totalAppsScanned: scan.totalAppsScanned,
          estimatedRequests: scan.estimatedRequests,
          matches: scan.matches,
          detectionsUpserted,
        }),
        { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
      );
    }

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

    const supabase = buildSupabaseClient();
    const startedAt = Date.now();
    const nowIso = new Date().toISOString();
    const targetsByUser = await loadTargetsByUser(
      supabase,
      body?.userId,
      body?.targetAppName,
    );

    const userErrors: { user_id: string; error: string }[] = [];
    let usersProcessed = 0;
    let detectionsUpserted = 0;
    let scannedKeywordGeos = 0;
    let totalAppsScanned = 0;
    let estimatedRequests = 0;

    for (const [userId, targets] of targetsByUser.entries()) {
      usersProcessed++;

      try {
        const scan = await scanTargets(targets, options, stopWords, !!body?.dryRun);
        scannedKeywordGeos += scan.scannedKeywordGeos;
        totalAppsScanned += scan.totalAppsScanned;
        estimatedRequests += scan.estimatedRequests;

        if (body?.dryRun) continue;

        detectionsUpserted += await upsertDetections(supabase, userId, scan.matches, nowIso);
        try {
          await refreshBannedStatuses(
            supabase,
            userId,
            targets.map((target) => target.appName),
            nowIso,
          );
        } catch (banError) {
          console.error(`[competitor-tracker] ban refresh failed user=${userId}`, banError);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        userErrors.push({ user_id: userId, error: message });
        console.error(`[competitor-tracker] user=${userId} error`, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scheduled: true,
        dryRun: !!body?.dryRun,
        usersProcessed,
        detectionsUpserted,
        scannedKeywordGeos,
        totalAppsScanned,
        estimatedRequests,
        userErrors,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[competitor-tracker] error", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  }
});
