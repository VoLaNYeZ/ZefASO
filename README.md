# ZefASO

ZefASO is a React + Supabase dashboard for App Store Optimization workflows. It helps teams import ASO performance data, monitor keyword rank movement, analyze spend efficiency, refresh App Store standings, and track competitor signals.

Repository: [github.com/VoLaNYeZ/ZefASO](https://github.com/VoLaNYeZ/ZefASO)

## Features

- Import ASO data from CSV, pasted tables, manual rows, or Google Sheets.
- Track rank, installs, CPI, spend, and keyword performance over time.
- View dashboards for app, geo, keyword, folder, and date ranges.
- Generate AI-assisted ASO analysis and keyword suggestions through server-side proxy functions.
- Refresh live App Store standings and ASOMobile traffic signals.
- Detect warning conditions such as stale data, lost rank, low efficiency, and stalled keywords.
- Track potential competitors with fuzzy matching and App Store search signals.

## Stack

- React 19, TypeScript, Vite
- Tailwind CSS, Recharts, Lucide icons
- Supabase Auth, Postgres, Realtime, and Edge Functions
- OpenAI, iTunes Search API, ASOMobile, and Google Apps Script integrations

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the public Supabase values in `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Private API keys and service-role keys must be configured as Supabase Edge Function secrets, not committed to the repository.

## Build

```bash
npm run build
npm run preview
```
