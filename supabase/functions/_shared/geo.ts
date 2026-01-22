const GEO_ALIASES: Record<string, string> = {
  // Non-standard codes and aliases
  UK: "GB",
  EN: "GB",
  SW: "SE",
  NE: "NL",
  PO: "PL",
  UAE: "AE",
  ME: "MX",
  MEX: "MX",
  MG: "MG",
  MNE: "MG",
  DUBAI: "AE",
  BALI: "ID",

  // Full names / variants
  ARGENTINA: "AR",
  "UNITED STATES": "US",
  USA: "US",
  "UNITED KINGDOM": "GB",
  "UNITED ARAB EMIRATES": "AE",
  AUSTRALIA: "AU",
  AUSTRIA: "AT",
  BELGIUM: "BE",
  BRAZIL: "BR",
  CANADA: "CA",
  CHILE: "CL",
  CHINA: "CN",
  COLOMBIA: "CO",
  CROATIA: "HR",
  "CZECH REPUBLIC": "CZ",
  DENMARK: "DK",
  EGYPT: "EG",
  FINLAND: "FI",
  FRANCE: "FR",
  GERMANY: "DE",
  GREECE: "GR",
  HONGKONG: "HK",
  "HONG KONG": "HK",
  HUNGARY: "HU",
  INDIA: "IN",
  INDONESIA: "ID",
  IRELAND: "IE",
  ISRAEL: "IL",
  ITALY: "IT",
  JAPAN: "JP",
  MALAYSIA: "MY",
  MEXICO: "MX",
  MONTENEGRO: "MG",
  NETHERLANDS: "NL",
  "NEW ZEALAND": "NZ",
  NORWAY: "NO",
  PERU: "PE",
  PHILIPPINES: "PH",
  POLAND: "PL",
  PORTUGAL: "PT",
  ROMANIA: "RO",
  RUSSIA: "RU",
  "SAUDI ARABIA": "SA",
  SINGAPORE: "SG",
  SLOVAKIA: "SK",
  "SOUTH AFRICA": "ZA",
  "SOUTH KOREA": "KR",
  SPAIN: "ES",
  SWEDEN: "SE",
  SWITZERLAND: "CH",
  TAIWAN: "TW",
  THAILAND: "TH",
  TURKEY: "TR",
  UKRAINE: "UA",
  VIETNAM: "VN",

  // 3-letter codes sometimes appear
  AUS: "AU",
  AUT: "AT",
  POL: "PL",
};

const GEO_TO_ISO: Record<string, string> = {
  MG: "ME",
};

export const normalizeGeoInput = (geo: string): string => {
  const trimmed = (geo ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  return GEO_ALIASES[upper] || upper;
};

export const toIsoCountryCode = (geo: string): string => {
  const normalized = normalizeGeoInput(geo);
  if (!normalized) return "";
  const upper = normalized.toUpperCase();
  if (upper === "ALL") return "ALL";
  return GEO_TO_ISO[upper] || upper;
};
