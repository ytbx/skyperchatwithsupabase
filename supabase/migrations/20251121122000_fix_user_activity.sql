-- Fix user_activity table schema
-- Drop and recreate with correct columns

DROP TABLE IF EXISTS user_activity CASCADE;

CREATE TABLE user_activity (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy', 'idle', 'dnd', 'invisible')),
  custom_status TEXT,
  custom_status_emoji TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  heartbeat TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all user activity" ON user_activity FOR SELECT USING (true);
CREATE POLICY "Users can update own activity" ON user_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activity status" ON user_activity FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own activity" ON user_activity FOR ALL USING (auth.uid() = user_id);

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_activity;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_status ON user_activity(status);
CREATE INDEX IF NOT EXISTS idx_user_activity_heartbeat ON user_activity(heartbeat);
