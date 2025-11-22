-- ============================================
-- FIX RLS POLICIES AND SCHEMA ISSUES
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FIX SERVER_INVITES TABLE RLS
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view invites" ON server_invites;
DROP POLICY IF EXISTS "Server owners can create invites" ON server_invites;
DROP POLICY IF EXISTS "Anyone can view invites by code" ON server_invites;

-- Create proper RLS policies for server_invites
CREATE POLICY "Anyone can view invites by code" ON server_invites 
  FOR SELECT 
  USING (true);

CREATE POLICY "Server members can create invites" ON server_invites 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM server_users 
      WHERE server_users.server_id = server_invites.server_id 
      AND server_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can delete invites" ON server_invites 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_invites.server_id 
      AND servers.owner_id = auth.uid()
    )
  );

-- ============================================
-- 2. FIX SERVER_ROLES TABLE RLS
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view roles" ON server_roles;
DROP POLICY IF EXISTS "Server owners can manage roles" ON server_roles;

-- Create proper RLS policies for server_roles
CREATE POLICY "Users can view server roles" ON server_roles 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM server_users 
      WHERE server_users.server_id = server_roles.server_id 
      AND server_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can create roles" ON server_roles 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_roles.server_id 
      AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can update roles" ON server_roles 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_roles.server_id 
      AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can delete roles" ON server_roles 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_roles.server_id 
      AND servers.owner_id = auth.uid()
    )
  );

-- ============================================
-- 3. FIX SERVER_USERS TABLE - REMOVE ID COLUMN FROM QUERIES
-- ============================================
-- Note: The server_users table doesn't have an 'id' column
-- It uses (server_id, user_id) as composite primary key
-- This is correct, but the frontend code needs to be updated

-- Verify the table structure
DO $$ 
BEGIN
  -- Check if id column exists (it shouldn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'server_users' 
    AND column_name = 'id'
  ) THEN
    RAISE NOTICE 'Warning: server_users has an id column, which is unexpected';
  ELSE
    RAISE NOTICE 'Confirmed: server_users uses composite key (server_id, user_id)';
  END IF;
END $$;

-- ============================================
-- 4. ADD INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_server_invites_server_id ON server_invites(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_code ON server_invites(code);
CREATE INDEX IF NOT EXISTS idx_server_roles_server_id ON server_roles(server_id);

-- ============================================
-- 5. VERIFY RLS IS ENABLED
-- ============================================

ALTER TABLE server_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DONE! RLS policies are now fixed.
-- ============================================

-- To verify, run:
-- SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('server_invites', 'server_roles', 'server_users');
