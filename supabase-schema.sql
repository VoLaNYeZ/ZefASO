
-- 1. ASO Entries Table
CREATE TABLE aso_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_id TEXT NOT NULL,
  geo TEXT NOT NULL,
  keyword TEXT NOT NULL,
  installs INTEGER NOT NULL,
  ranking INTEGER NOT NULL,
  cpi DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, app_id, geo, keyword)
);

-- 2. App Settings Table
CREATE TABLE app_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  app_icons JSONB DEFAULT '{}',
  categories TEXT[] DEFAULT ARRAY['General'],
  app_category_map JSONB DEFAULT '{}',
  collapsed_categories TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User Preferences Table
CREATE TABLE user_preferences (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  lang TEXT DEFAULT 'en',
  theme TEXT DEFAULT 'light',
  hidden_apps TEXT[] DEFAULT '{}',
  api_usage JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE aso_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view their own ASO entries"
  ON aso_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ASO entries"
  ON aso_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ASO entries"
  ON aso_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ASO entries"
  ON aso_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own app settings"
  ON app_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own app settings"
  ON app_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own app settings"
  ON app_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_aso_entries_user_date ON aso_entries(user_id, date);
CREATE INDEX idx_aso_entries_app_name ON aso_entries(user_id, app_name);
