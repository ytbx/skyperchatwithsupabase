-- ============================================
-- COMPLETE FIX FOR SKYPERCHAT DATABASE
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FIX USER_ACTIVITY TABLE
-- ============================================

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
CREATE POLICY "Users can insert own activity" ON user_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activity" ON user_activity FOR UPDATE USING (auth.uid() = user_id);

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_activity;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_status ON user_activity(status);
CREATE INDEX IF NOT EXISTS idx_user_activity_heartbeat ON user_activity(heartbeat);

-- ============================================
-- 2. FIX SERVER_USERS TABLE RLS
-- ============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Server members viewable by members" ON server_users;
DROP POLICY IF EXISTS "Users can join servers" ON server_users;
DROP POLICY IF EXISTS "Server owners can manage members" ON server_users;

-- Create proper RLS policies
CREATE POLICY "Users can view server members" ON server_users 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can join servers" ON server_users 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Server owners can manage members" ON server_users 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_users.server_id 
      AND servers.owner_id = auth.uid()
    )
    OR auth.uid() = user_id
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_server_users_server_id ON server_users(server_id);
CREATE INDEX IF NOT EXISTS idx_server_users_user_id ON server_users(user_id);

-- ============================================
-- 3. FIX SERVERS TABLE RLS
-- ============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Server owners can update" ON servers;
DROP POLICY IF EXISTS "Server owners can delete" ON servers;
DROP POLICY IF EXISTS "Users can view servers they are members of" ON servers;
DROP POLICY IF EXISTS "Users can create servers" ON servers;

-- Create proper RLS policies
CREATE POLICY "Anyone can view servers" ON servers 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can create servers" ON servers 
  FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Server owners can update their servers" ON servers 
  FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Server owners can delete their servers" ON servers 
  FOR DELETE 
  USING (auth.uid() = owner_id);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON servers(owner_id);

-- ============================================
-- DONE! Your database is now fixed.
-- ============================================
