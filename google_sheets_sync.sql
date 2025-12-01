-- ============================================
-- Google Sheets Sync Schema (Apps Script Version)
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS google_sheets_sync (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  web_app_url TEXT NOT NULL,
  is_sync_enabled BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  selected_tabs JSONB DEFAULT '[]', -- Array of tab names to sync
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE google_sheets_sync ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sync settings"
  ON google_sheets_sync FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync settings"
  ON google_sheets_sync FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync settings"
  ON google_sheets_sync FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync settings"
  ON google_sheets_sync FOR DELETE
  USING (auth.uid() = user_id);
